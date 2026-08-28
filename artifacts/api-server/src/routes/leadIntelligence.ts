/**
 * Lead Intelligence API — list, scores, ICP profile, company/contact cards, progress.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  campaignRecommendationsTable,
  companiesTable,
  companyIcpAnalysisTable,
  companyIntelligenceTable,
  contactIntelligenceTable,
  leadScoresTable,
  leadsTable,
  painHypothesesTable,
  productIcpProfilesTable,
  researchJobsTable,
  buyingSignalsTable,
} from "@workspace/db/schema";
import { canAccessProduct } from "../lib/productAccess";
import { getResearchProgress, processResearchJobs } from "../lib/lead-intelligence/researchProcessor";
import { enqueueCompanyResearch, writeAudit } from "../lib/lead-intelligence/companyService";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  return true;
}

function parseId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const icpProfileSchema = z.object({
  targetIndustries: z.array(z.string()).optional(),
  employeeMin: z.number().int().min(0).nullable().optional(),
  employeeMax: z.number().int().min(0).nullable().optional(),
  targetGeographies: z.array(z.string()).optional(),
  targetRoles: z.array(z.string()).optional(),
  positiveCharacteristics: z.array(z.string()).optional(),
  negativeCharacteristics: z.array(z.string()).optional(),
  hardExclusions: z.record(z.string(), z.unknown()).optional(),
});

// GET /api/products/:productId/lead-intelligence
router.get("/products/:productId/lead-intelligence", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const tier = typeof req.query.tier === "string" ? req.query.tier.trim() : "";
  const status = typeof req.query.researchStatus === "string" ? req.query.researchStatus.trim() : "";
  const sort = typeof req.query.sort === "string" ? req.query.sort : "priority";

  const conditions = [eq(leadsTable.productId, productId)];
  if (req.user!.role !== "owner") {
    conditions.push(eq(leadsTable.assignedToUserId, req.user!.id));
  }
  if (status) conditions.push(eq(leadsTable.researchStatus, status));
  if (q) {
    conditions.push(or(
      ilike(leadsTable.firstName, `%${q}%`),
      ilike(leadsTable.lastName, `%${q}%`),
      ilike(leadsTable.company, `%${q}%`),
      ilike(leadsTable.email, `%${q}%`),
      ilike(leadsTable.title, `%${q}%`),
    )!);
  }

  const rows = await db
    .select({
      lead: leadsTable,
      company: companiesTable,
      score: leadScoresTable,
      contact: contactIntelligenceTable,
      icp: companyIcpAnalysisTable,
      recommendation: campaignRecommendationsTable,
    })
    .from(leadsTable)
    .leftJoin(companiesTable, eq(leadsTable.companyId, companiesTable.id))
    .leftJoin(leadScoresTable, eq(leadScoresTable.leadId, leadsTable.id))
    .leftJoin(contactIntelligenceTable, eq(contactIntelligenceTable.leadId, leadsTable.id))
    .leftJoin(companyIcpAnalysisTable, and(
      eq(companyIcpAnalysisTable.companyId, leadsTable.companyId),
      eq(companyIcpAnalysisTable.productId, productId),
    ))
    .leftJoin(campaignRecommendationsTable, eq(campaignRecommendationsTable.leadId, leadsTable.id))
    .where(and(...conditions));

  let items = rows.map((r) => ({
    id: r.lead.id,
    firstName: r.lead.firstName,
    lastName: r.lead.lastName,
    email: r.lead.email,
    title: r.lead.title,
    company: r.company?.name ?? r.lead.company,
    companyId: r.lead.companyId,
    website: r.company?.website ?? null,
    industry: r.company?.industry ?? null,
    employeeCount: r.company?.employeeCount ?? null,
    location: r.company?.location ?? null,
    researchStatus: r.lead.researchStatus,
    icpScore: r.score?.icpScore ?? r.icp?.totalScore ?? null,
    contactScore: r.score?.contactScore ?? r.contact?.contactScore ?? null,
    buyingSignalScore: r.score?.buyingSignalScore ?? null,
    priorityScore: r.score?.priorityScore ?? null,
    tier: r.score?.tier ?? null,
    persona: r.contact?.persona ?? null,
    decisionRole: r.contact?.estimatedDecisionRole ?? null,
    recommendedCampaign: r.recommendation?.campaignAngle ?? null,
    recommendedSequenceId: r.recommendation?.sequenceId ?? null,
    recommendationReason: r.recommendation?.reason ?? null,
    disqualified: r.icp?.disqualified ?? false,
  }));

  if (tier) items = items.filter((i) => i.tier === tier);

  items.sort((a, b) => {
    if (sort === "name") {
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    }
    if (sort === "icp") return (b.icpScore ?? -1) - (a.icpScore ?? -1);
    if (sort === "contact") return (b.contactScore ?? -1) - (a.contactScore ?? -1);
    return (b.priorityScore ?? -1) - (a.priorityScore ?? -1);
  });

  const progress = await getResearchProgress(productId);

  const scores = items.filter((i) => i.priorityScore != null);
  const avg = (key: "icpScore" | "contactScore" | "priorityScore") => {
    const vals = scores.map((i) => i[key]).filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
  };

  const tierCounts = { A: 0, B: 0, C: 0, Reject: 0 };
  for (const i of items) {
    if (i.tier && i.tier in tierCounts) tierCounts[i.tier as keyof typeof tierCounts]++;
  }

  res.json({
    leads: items,
    progress,
    summary: {
      total: items.length,
      scored: scores.length,
      avgIcp: avg("icpScore"),
      avgContact: avg("contactScore"),
      avgPriority: avg("priorityScore"),
      tierCounts,
    },
  });
});

// GET /api/products/:productId/lead-intelligence/progress
router.get("/products/:productId/lead-intelligence/progress", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json(await getResearchProgress(productId));
});

// POST /api/products/:productId/lead-intelligence/process — manual kick (also run by cron)
router.post("/products/:productId/lead-intelligence/process", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const result = await processResearchJobs(Number(req.body?.limit) || 5);
  res.json({ ...result, progress: await getResearchProgress(productId) });
});

// GET/PUT ICP profile
router.get("/products/:productId/icp-profile", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const [row] = await db.select().from(productIcpProfilesTable).where(eq(productIcpProfilesTable.productId, productId)).limit(1);
  res.json({ profile: row ?? null });
});

router.put("/products/:productId/icp-profile", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const parsed = icpProfileSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid profile" }); return; }

  const [existing] = await db.select().from(productIcpProfilesTable).where(eq(productIcpProfilesTable.productId, productId)).limit(1);
  const values = {
    productId,
    targetIndustries: parsed.data.targetIndustries ?? existing?.targetIndustries ?? [],
    employeeMin: parsed.data.employeeMin === undefined ? existing?.employeeMin ?? null : parsed.data.employeeMin,
    employeeMax: parsed.data.employeeMax === undefined ? existing?.employeeMax ?? null : parsed.data.employeeMax,
    targetGeographies: parsed.data.targetGeographies ?? existing?.targetGeographies ?? [],
    targetRoles: parsed.data.targetRoles ?? existing?.targetRoles ?? [],
    positiveCharacteristics: parsed.data.positiveCharacteristics ?? existing?.positiveCharacteristics ?? [],
    negativeCharacteristics: parsed.data.negativeCharacteristics ?? existing?.negativeCharacteristics ?? [],
    hardExclusions: parsed.data.hardExclusions ?? existing?.hardExclusions ?? {},
  };

  const [row] = existing
    ? await db.update(productIcpProfilesTable).set(values).where(eq(productIcpProfilesTable.id, existing.id)).returning()
    : await db.insert(productIcpProfilesTable).values(values).returning();

  await writeAudit({ productId, eventType: "icp_profile_saved", payload: { profileId: row.id } });
  res.json({ profile: row });
});

// Company intelligence card
router.get("/products/:productId/companies/:companyId/intelligence", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  const companyId = parseId(req.params.companyId);
  if (!productId || !companyId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [company] = await db.select().from(companiesTable).where(and(eq(companiesTable.id, companyId), eq(companiesTable.productId, productId))).limit(1);
  if (!company) { res.status(404).json({ error: "Company not found" }); return; }

  const [intel] = await db.select().from(companyIntelligenceTable).where(and(eq(companyIntelligenceTable.companyId, companyId), eq(companyIntelligenceTable.productId, productId))).limit(1);
  const [icp] = await db.select().from(companyIcpAnalysisTable).where(and(eq(companyIcpAnalysisTable.companyId, companyId), eq(companyIcpAnalysisTable.productId, productId))).limit(1);
  const pains = await db.select().from(painHypothesesTable).where(and(eq(painHypothesesTable.companyId, companyId), eq(painHypothesesTable.productId, productId))).orderBy(asc(painHypothesesTable.priority));
  const signals = await db.select().from(buyingSignalsTable).where(eq(buyingSignalsTable.companyId, companyId));

  res.json({ company, intelligence: intel ?? null, icp: icp ?? null, pains, signals });
});

// Contact intelligence card
router.get("/leads/:leadId/intelligence", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const leadId = parseId(req.params.leadId);
  if (!leadId) { res.status(400).json({ error: "Invalid lead id" }); return; }

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId)).limit(1);
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  if (lead.productId && !await canAccessProduct(req, lead.productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [contact] = await db.select().from(contactIntelligenceTable).where(eq(contactIntelligenceTable.leadId, leadId)).limit(1);
  const [score] = await db.select().from(leadScoresTable).where(eq(leadScoresTable.leadId, leadId)).limit(1);
  const recommendations = await db.select().from(campaignRecommendationsTable).where(eq(campaignRecommendationsTable.leadId, leadId)).orderBy(desc(campaignRecommendationsTable.createdAt)).limit(3);

  res.json({ lead, contact: contact ?? null, score: score ?? null, recommendations });
});

// Bulk assign recommended sequence (approval)
router.post("/products/:productId/lead-intelligence/assign-campaigns", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const leadIds = Array.isArray(req.body?.leadIds)
    ? req.body.leadIds.filter((id: unknown): id is number => typeof id === "number" && id > 0)
    : [];
  if (!leadIds.length) { res.status(400).json({ error: "leadIds required" }); return; }

  const recs = await db
    .select()
    .from(campaignRecommendationsTable)
    .where(inArray(campaignRecommendationsTable.leadId, leadIds));

  const assigned = recs.filter((r) => r.sequenceId != null).map((r) => ({
    leadId: r.leadId,
    sequenceId: r.sequenceId,
    angle: r.campaignAngle,
  }));

  await writeAudit({
    productId,
    eventType: "campaign_assignment_approved",
    payload: { assigned, count: assigned.length },
  });

  res.json({
    assigned,
    message: assigned.length
      ? `Approved ${assigned.length} campaign recommendation${assigned.length === 1 ? "" : "s"}. Enrol via Email Sequences when ready.`
      : "No sequence recommendations to assign yet.",
  });
});

// Re-queue research for selected companies / all unscored
router.post("/products/:productId/lead-intelligence/requeue", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const companies = await db.select().from(companiesTable).where(eq(companiesTable.productId, productId));
  let queued = 0;
  for (const c of companies) {
    // Force queue by inserting pending even if recently researched when body.force
    if (req.body?.force) {
      await db.insert(researchJobsTable).values({ productId, companyId: c.id, status: "pending" });
      queued++;
    } else {
      const job = await enqueueCompanyResearch(productId, c.id);
      if (job) queued++;
    }
  }
  res.json({ queued, companies: companies.length });
});

export default router;
