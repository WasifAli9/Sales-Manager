/**
 * Async research job processor: company intel → ICP → contact → pain → scores → campaign reco.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  buyingSignalsTable,
  campaignRecommendationsTable,
  companiesTable,
  companyIcpAnalysisTable,
  companyIntelligenceTable,
  contactIntelligenceTable,
  emailSequencesTable,
  leadScoresTable,
  leadsTable,
  painHypothesesTable,
  productIcpProfilesTable,
  productsTable,
  researchJobsTable,
} from "@workspace/db/schema";
import { scrapeWebsite } from "../webscraper";
import { runJson } from "../ai";
import { logger } from "../logger";
import { writeAudit } from "./companyService";
import { emitAgentEvent } from "../founder-planner/service";
import {
  computePriorityScore,
  inferPainHypotheses,
  scoreCompanyAgainstIcp,
  scoreContactRelevance,
  tierFromPriority,
} from "./scoring";

const BATCH_SIZE = 5;
const FRESHNESS_DAYS = 30;

async function getIcpProfile(productId: number) {
  const [row] = await db
    .select()
    .from(productIcpProfilesTable)
    .where(eq(productIcpProfilesTable.productId, productId))
    .limit(1);
  return row ?? null;
}

async function researchWebsite(company: typeof companiesTable.$inferSelect) {
  if (!company.website) {
    return {
      summary: `${company.name} — research based on Apollo fields only.`,
      whatTheyDo: company.industry ? `Operates in ${company.industry}.` : null,
      websiteEvidence: null as string | null,
      industry: company.industry,
      complexity: null as string | null,
      customerType: null as string | null,
      businessModel: null as string | null,
      servicesOffered: null as string | null,
      source: "apollo",
    };
  }

  try {
    const pageText = await scrapeWebsite(company.website);
    const excerpt = pageText.slice(0, 6000);
    const { json } = await runJson(
      `You analyse B2B company websites for sales qualification. Return ONLY JSON with keys:
summary (string), whatTheyDo (string), industry (string), subsector (string|null),
complexity (low|medium|high), customerType (string|null), businessModel (string|null),
servicesOffered (string|null), locationsEstimate (string|null).
Be concise. No em dashes.`,
      `Company: ${company.name}\nWebsite: ${company.website}\n\nWebsite text:\n${excerpt}`,
    );
    const data = json as Record<string, unknown>;
    return {
      summary: String(data.summary ?? "").slice(0, 2000) || `${company.name} website analysed.`,
      whatTheyDo: data.whatTheyDo ? String(data.whatTheyDo).slice(0, 1000) : null,
      websiteEvidence: excerpt.slice(0, 1500),
      industry: data.industry ? String(data.industry) : company.industry,
      complexity: data.complexity ? String(data.complexity) : null,
      customerType: data.customerType ? String(data.customerType) : null,
      businessModel: data.businessModel ? String(data.businessModel) : null,
      servicesOffered: data.servicesOffered ? String(data.servicesOffered) : null,
      locationsEstimate: data.locationsEstimate ? String(data.locationsEstimate) : null,
      subsector: data.subsector ? String(data.subsector) : null,
      source: "website+apollo",
    };
  } catch (err) {
    logger.warn({ err, companyId: company.id }, "Website research failed; falling back to Apollo fields");
    return {
      summary: `${company.name} — website research failed; using Apollo fields.`,
      whatTheyDo: company.industry ? `Operates in ${company.industry}.` : null,
      websiteEvidence: null as string | null,
      industry: company.industry,
      complexity: null as string | null,
      customerType: null as string | null,
      businessModel: null as string | null,
      servicesOffered: null as string | null,
      locationsEstimate: null as string | null,
      subsector: null as string | null,
      source: "apollo_fallback",
    };
  }
}

async function processCompanyJob(job: typeof researchJobsTable.$inferSelect) {
  const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, job.companyId)).limit(1);
  if (!company) throw new Error("Company not found");

  await db
    .update(leadsTable)
    .set({ researchStatus: "researching" })
    .where(and(eq(leadsTable.companyId, company.id), eq(leadsTable.productId, job.productId)));

  const researched = await researchWebsite(company);
  const profile = await getIcpProfile(job.productId);
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, job.productId)).limit(1);

  const icp = scoreCompanyAgainstIcp(
    {
      industry: researched.industry ?? company.industry,
      employeeCount: company.employeeCount,
      location: company.location,
      summary: researched.summary,
      whatTheyDo: researched.whatTheyDo,
      complexity: researched.complexity,
    },
    profile,
  );

  // Upsert company intelligence
  const intelValues = {
    companyId: company.id,
    productId: job.productId,
    summary: researched.summary,
    industry: researched.industry ?? company.industry,
    subsector: researched.subsector ?? null,
    employeeEstimate: company.employeeCount,
    locationsEstimate: researched.locationsEstimate ?? company.location,
    operatingModel: researched.businessModel,
    complexity: researched.complexity,
    whatTheyDo: researched.whatTheyDo,
    customerType: researched.customerType,
    businessModel: researched.businessModel,
    servicesOffered: researched.servicesOffered,
    websiteEvidence: researched.websiteEvidence,
    researchStatus: "complete",
    researchVersion: 1,
    sourceData: { source: researched.source },
    researchedAt: new Date(),
  };

  const [existingIntel] = await db
    .select({ id: companyIntelligenceTable.id })
    .from(companyIntelligenceTable)
    .where(and(
      eq(companyIntelligenceTable.companyId, company.id),
      eq(companyIntelligenceTable.productId, job.productId),
    ))
    .limit(1);

  if (existingIntel) {
    await db.update(companyIntelligenceTable).set(intelValues).where(eq(companyIntelligenceTable.id, existingIntel.id));
  } else {
    await db.insert(companyIntelligenceTable).values(intelValues);
  }

  // ICP analysis
  const icpValues = {
    companyId: company.id,
    productId: job.productId,
    industryScore: icp.industryScore,
    sizeScore: icp.sizeScore,
    geographyScore: icp.geographyScore,
    complexityScore: icp.complexityScore,
    problemFitScore: icp.problemFitScore,
    signalScore: icp.signalScore,
    totalScore: icp.totalScore,
    disqualified: icp.disqualified,
    disqualificationReason: icp.disqualificationReason,
    reasoning: icp.reasoning,
  };
  const [existingIcp] = await db
    .select({ id: companyIcpAnalysisTable.id })
    .from(companyIcpAnalysisTable)
    .where(and(
      eq(companyIcpAnalysisTable.companyId, company.id),
      eq(companyIcpAnalysisTable.productId, job.productId),
    ))
    .limit(1);
  if (existingIcp) {
    await db.update(companyIcpAnalysisTable).set(icpValues).where(eq(companyIcpAnalysisTable.id, existingIcp.id));
  } else {
    await db.insert(companyIcpAnalysisTable).values(icpValues);
  }

  // Pain hypotheses (replace)
  await db.delete(painHypothesesTable).where(and(
    eq(painHypothesesTable.companyId, company.id),
    eq(painHypothesesTable.productId, job.productId),
  ));
  const pains = inferPainHypotheses({
    industry: researched.industry,
    whatTheyDo: researched.whatTheyDo,
    summary: researched.summary,
    productIcpText: product?.icp,
  });
  if (pains.length) {
    await db.insert(painHypothesesTable).values(
      pains.map((p) => ({
        companyId: company.id,
        productId: job.productId,
        painCategory: p.painCategory,
        confidence: p.confidence,
        evidence: p.evidence,
        priority: p.priority,
      })),
    );
  }

  // Lightweight buying signal from website if hiring/growth language present
  const evidenceBlob = `${researched.summary} ${researched.websiteEvidence ?? ""}`.toLowerCase();
  await db.delete(buyingSignalsTable).where(eq(buyingSignalsTable.companyId, company.id));
  let intentScore = 35;
  if (/(hiring|we're growing|careers|join our team|expansion)/i.test(evidenceBlob)) {
    intentScore = 70;
    await db.insert(buyingSignalsTable).values({
      companyId: company.id,
      signalType: "growth_or_hiring",
      description: "Public growth or hiring language detected",
      evidence: evidenceBlob.slice(0, 300),
      source: researched.source,
      sourceUrl: company.website,
      confidence: 65,
    });
  }

  // Update company industry from research
  if (researched.industry && researched.industry !== company.industry) {
    await db.update(companiesTable).set({ industry: researched.industry }).where(eq(companiesTable.id, company.id));
  }

  // Contact scoring for all leads at this company
  const leads = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.companyId, company.id), eq(leadsTable.productId, job.productId)));

  const sequences = await db
    .select({ id: emailSequencesTable.id, name: emailSequencesTable.name })
    .from(emailSequencesTable)
    .where(eq(emailSequencesTable.productId, job.productId))
    .orderBy(asc(emailSequencesTable.id))
    .limit(5);

  const targetRoles = profile?.targetRoles ?? [];
  const primaryPain = pains[0]?.painCategory ?? "operational_efficiency";

  for (const lead of leads) {
    const contact = scoreContactRelevance(lead.title, targetRoles);
    const [existingContact] = await db
      .select({ id: contactIntelligenceTable.id })
      .from(contactIntelligenceTable)
      .where(eq(contactIntelligenceTable.leadId, lead.id))
      .limit(1);

    const contactValues = {
      leadId: lead.id,
      persona: contact.persona,
      estimatedDecisionRole: contact.estimatedDecisionRole,
      roleRelevance: contact.roleRelevance,
      seniorityRelevance: contact.seniorityRelevance,
      contactScore: contact.contactScore,
      whyThisPerson: contact.reasoning,
      suggestedOpeningAngle: `Lead with ${primaryPain.replace(/_/g, " ")} for ${lead.title || "this role"}.`,
      personalisationFacts: [lead.company, lead.title].filter(Boolean) as string[],
      reasoning: contact.reasoning,
    };

    if (existingContact) {
      await db.update(contactIntelligenceTable).set(contactValues).where(eq(contactIntelligenceTable.id, existingContact.id));
    } else {
      await db.insert(contactIntelligenceTable).values(contactValues);
    }

    const priorityScore = icp.disqualified
      ? 0
      : computePriorityScore(icp.totalScore, contact.contactScore, intentScore);
    const tier = tierFromPriority(priorityScore, icp.disqualified);

    const [existingScore] = await db
      .select({ id: leadScoresTable.id })
      .from(leadScoresTable)
      .where(eq(leadScoresTable.leadId, lead.id))
      .limit(1);

    const scoreValues = {
      leadId: lead.id,
      companyId: company.id,
      icpScore: icp.totalScore,
      contactScore: contact.contactScore,
      buyingSignalScore: intentScore,
      priorityScore,
      tier,
      calculatedAt: new Date(),
    };

    if (existingScore) {
      await db.update(leadScoresTable).set(scoreValues).where(eq(leadScoresTable.id, existingScore.id));
    } else {
      await db.insert(leadScoresTable).values(scoreValues);
    }

    // Campaign recommendation (prefer first product sequence)
    await db.delete(campaignRecommendationsTable).where(eq(campaignRecommendationsTable.leadId, lead.id));
    const recommendedSequence = sequences[0] ?? null;
    await db.insert(campaignRecommendationsTable).values({
      leadId: lead.id,
      sequenceId: recommendedSequence?.id ?? null,
      campaignAngle: primaryPain,
      confidence: Math.round((priorityScore + (recommendedSequence ? 10 : 0)) / 1.1),
      reason: recommendedSequence
        ? `Recommend "${recommendedSequence.name}" angled at ${primaryPain.replace(/_/g, " ")} (Tier ${tier}).`
        : `No sequence yet — create one for ${primaryPain.replace(/_/g, " ")} (Tier ${tier}).`,
    });

    await db
      .update(leadsTable)
      .set({ researchStatus: icp.disqualified ? "skipped" : "scored" })
      .where(eq(leadsTable.id, lead.id));

    // Founder Daily Planner — Tier A / strong buying signals
    try {
      if (tier === "A") {
        const leadLabel = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || lead.email || `#${lead.id}`;
        await emitAgentEvent({
          productId: job.productId,
          sourceAgent: "lead_intelligence",
          sourceEntityType: "lead",
          sourceEntityId: lead.id,
          eventType: "tier_a_lead",
          title: `Tier A lead: ${leadLabel}`,
          description: `${company.name} — priority ${priorityScore}`,
          commercialValue: Math.min(100, priorityScore),
          probability: Math.min(90, Math.round(priorityScore * 0.7)),
          urgency: 65,
          humanDependency: 55,
          riskScore: 10,
          strategicScore: 70,
          confidence: priorityScore,
          recommendedAction: "Prioritise outreach or enroll in recommended sequence",
          actionType: "outreach",
          executionType: "user_acts",
          payload: { tier, priorityScore, companyId: company.id },
        });
      } else if ((intentScore ?? 0) >= 70) {
        await emitAgentEvent({
          productId: job.productId,
          sourceAgent: "lead_intelligence",
          sourceEntityType: "lead",
          sourceEntityId: lead.id,
          eventType: "buying_signal",
          title: `Buying signal: ${company.name}`,
          description: lead.email ?? undefined,
          commercialValue: Math.min(100, intentScore),
          probability: 55,
          urgency: 70,
          humanDependency: 50,
          riskScore: 15,
          strategicScore: 50,
          recommendedAction: "Review buying signals and engage",
          actionType: "outreach",
          executionType: "user_acts",
          payload: { tier, intentScore, companyId: company.id },
        });
      }
    } catch {
      // non-fatal
    }
  }

  await writeAudit({
    productId: job.productId,
    companyId: company.id,
    eventType: "research_completed",
    payload: { tierCounts: leads.length, icpScore: icp.totalScore, disqualified: icp.disqualified },
  });
}

export async function processResearchJobs(limit = BATCH_SIZE): Promise<{ processed: number; failed: number }> {
  const jobs = await db
    .select()
    .from(researchJobsTable)
    .where(eq(researchJobsTable.status, "pending"))
    .orderBy(asc(researchJobsTable.createdAt))
    .limit(limit);

  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    await db
      .update(researchJobsTable)
      .set({
        status: "running",
        startedAt: new Date(),
        attempts: sql`${researchJobsTable.attempts} + 1`,
      })
      .where(eq(researchJobsTable.id, job.id));

    try {
      await processCompanyJob(job);
      await db
        .update(researchJobsTable)
        .set({ status: "done", completedAt: new Date(), errorMessage: null })
        .where(eq(researchJobsTable.id, job.id));
      processed++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, jobId: job.id }, "Research job failed");
      await db
        .update(researchJobsTable)
        .set({ status: "failed", completedAt: new Date(), errorMessage: message })
        .where(eq(researchJobsTable.id, job.id));
      await db
        .update(leadsTable)
        .set({ researchStatus: "failed" })
        .where(and(eq(leadsTable.companyId, job.companyId), eq(leadsTable.productId, job.productId)));
    }
  }

  return { processed, failed };
}

export async function getResearchProgress(productId: number) {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${researchJobsTable.status} = 'pending')::int`,
      running: sql<number>`count(*) filter (where ${researchJobsTable.status} = 'running')::int`,
      done: sql<number>`count(*) filter (where ${researchJobsTable.status} = 'done')::int`,
      failed: sql<number>`count(*) filter (where ${researchJobsTable.status} = 'failed')::int`,
    })
    .from(researchJobsTable)
    .where(eq(researchJobsTable.productId, productId));

  return {
    total: row?.total ?? 0,
    pending: row?.pending ?? 0,
    running: row?.running ?? 0,
    done: row?.done ?? 0,
    failed: row?.failed ?? 0,
    researched: (row?.done ?? 0),
  };
}

export { FRESHNESS_DAYS };
