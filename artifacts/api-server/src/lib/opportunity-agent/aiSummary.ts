import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  opportunityIntelligenceTable,
  pipelineDealsTable,
  productOpportunitySettingsTable,
} from "@workspace/db/schema";
import { runJson } from "../ai";
import { changeDealStage, getDealIntelligenceBundle, writeOppAudit } from "./service";

export async function generateDealAiSummary(dealId: number) {
  const bundle = await getDealIntelligenceBundle(dealId);
  if (!bundle) throw new Error("Deal not found");

  const system = `You are a B2B deal coach. Summarise the opportunity and recommend strategy.
Return ONLY JSON with keys:
summary (string, max 3 sentences),
primary_pain (string|null),
deal_strategy (string),
recommended_next_action (string),
next_action_reason (string),
stage_recommendation (one of interested|discovery|demo|qualified|proposal|decision|negotiation|won|lost|null),
stage_recommendation_confidence (0-100),
stage_recommendation_evidence (string),
evidence (string[]),
inferences (string[]).
Distinguish evidence (from data) vs inferences. Never invent pricing or contracts.`;

  const user = JSON.stringify({
    deal: {
      stage: bundle.deal.stage,
      health: bundle.deal.health,
      probability: bundle.deal.probability,
      company: bundle.deal.companyName,
      contact: bundle.deal.contactName,
      value: bundle.deal.value,
      arr: bundle.deal.arr,
    },
    leadScore: bundle.leadScore,
    contactIntelligence: bundle.contactIntelligence,
    pains: bundle.pains,
    objections: bundle.objections,
    risks: bundle.risks,
    recentReplies: (bundle.replies as Array<{ analysis?: { classification?: string; summary?: string } }>).slice(0, 5).map((r) => ({
      classification: r.analysis?.classification,
      summary: r.analysis?.summary,
    })),
    qualification: bundle.qualification,
  });

  const { json } = await runJson(system, user);
  const data = json as Record<string, unknown>;

  const values = {
    summary: data.summary ? String(data.summary).slice(0, 2000) : null,
    primaryPain: data.primary_pain ? String(data.primary_pain) : bundle.intelligence?.primaryPain ?? null,
    dealStrategy: data.deal_strategy ? String(data.deal_strategy).slice(0, 2000) : null,
    recommendedNextAction: data.recommended_next_action ? String(data.recommended_next_action) : null,
    nextActionReason: data.next_action_reason ? String(data.next_action_reason) : null,
    stageRecommendation: data.stage_recommendation ? String(data.stage_recommendation) : null,
    stageRecommendationConfidence:
      typeof data.stage_recommendation_confidence === "number"
        ? data.stage_recommendation_confidence
        : null,
    stageRecommendationEvidence: data.stage_recommendation_evidence
      ? String(data.stage_recommendation_evidence)
      : null,
    rawAiJson: {
      ...data,
      evidence: data.evidence ?? [],
      inferences: data.inferences ?? [],
    },
  };

  const [existing] = await db
    .select({ id: opportunityIntelligenceTable.id })
    .from(opportunityIntelligenceTable)
    .where(eq(opportunityIntelligenceTable.dealId, dealId))
    .limit(1);

  const [row] = existing
    ? await db.update(opportunityIntelligenceTable).set(values).where(eq(opportunityIntelligenceTable.id, existing.id)).returning()
    : await db.insert(opportunityIntelligenceTable).values({ dealId, ...values }).returning();

  await writeOppAudit({
    productId: bundle.deal.productId,
    dealId,
    leadId: bundle.deal.leadId,
    eventType: "ai_summary_generated",
    payload: {
      confidence: values.stageRecommendationConfidence,
      stageRecommendation: values.stageRecommendation,
    },
  });

  // Optional auto stage move
  const [settings] = await db
    .select()
    .from(productOpportunitySettingsTable)
    .where(eq(productOpportunitySettingsTable.productId, bundle.deal.productId))
    .limit(1);

  if (
    settings?.autoStageMove &&
    values.stageRecommendation &&
    values.stageRecommendation !== bundle.deal.stage &&
    (values.stageRecommendationConfidence ?? 0) >= (settings.minStageConfidence ?? 90) &&
    values.stageRecommendation !== "won" &&
    values.stageRecommendation !== "lost"
  ) {
    await changeDealStage({
      dealId,
      toStage: values.stageRecommendation,
      source: "ai",
      reason: values.stageRecommendationEvidence ?? "AI stage recommendation",
      confidence: values.stageRecommendationConfidence,
    });
  }

  return row;
}
