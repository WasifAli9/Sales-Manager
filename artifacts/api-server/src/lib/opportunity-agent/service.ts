/**
 * Opportunity agent: settings, values, probability, health, create/dedupe, refresh.
 */
import {
  contactIntelligenceTable,
  dealActivitiesTable,
  inboundMessagesTable,
  leadScoresTable,
  leadsTable,
  lostDealDetailsTable,
  opportunityActionsTable,
  opportunityAgentAuditTable,
  opportunityContactsTable,
  opportunityIntelligenceTable,
  opportunityObjectionsTable,
  opportunityQualificationTable,
  opportunityRisksTable,
  opportunityStageHistoryTable,
  painHypothesesTable,
  pipelineDealsTable,
  productOpportunitySettingsTable,
  replyAnalysesTable,
  CLOSED_STAGES,
  PIPELINE_STAGES,
  type PipelineStage,
} from "@workspace/db/schema";
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { emitAgentEvent } from "../founder-planner/service";

export const DEFAULT_OPP_SETTINGS = {
  autoCreateEnabled: true,
  triggerBookMeeting: true,
  triggerInterested: true,
  triggerPricing: false,
  requireNonRejectTier: true,
  autoStageMove: false,
  minStageConfidence: 90,
  stallDays: 14,
};

export async function getOrCreateOppSettings(productId: number) {
  const [existing] = await db
    .select()
    .from(productOpportunitySettingsTable)
    .where(eq(productOpportunitySettingsTable.productId, productId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(productOpportunitySettingsTable)
    .values({ productId, ...DEFAULT_OPP_SETTINGS })
    .returning();
  return created;
}

export async function writeOppAudit(event: {
  productId?: number | null;
  dealId?: number | null;
  leadId?: number | null;
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  await db.insert(opportunityAgentAuditTable).values({
    productId: event.productId ?? null,
    dealId: event.dealId ?? null,
    leadId: event.leadId ?? null,
    eventType: event.eventType,
    payload: event.payload ?? null,
  });
}

export function computeMrrArr(value: number, frequency: string): { mrr: string; arr: string } {
  const mrr = frequency === "annual" ? value / 12 : value;
  const arr = frequency === "annual" ? value : value * 12;
  return { mrr: mrr.toFixed(2), arr: arr.toFixed(2) };
}

/** Base probability by stage (§14-style deterministic bands). */
export function probabilityForStage(stage: string): number {
  switch (stage) {
    case "interested": return 15;
    case "discovery": return 25;
    case "demo": return 40;
    case "qualified": return 55;
    case "proposal": return 65;
    case "decision": return 75;
    case "negotiation": return 85;
    case "won": return 100;
    case "lost": return 0;
    default: return 20;
  }
}

export function adjustProbability(opts: {
  stage: string;
  hasDecisionMaker: boolean;
  openObjections: number;
  openRisks: number;
  buyingIntent?: string | null;
}): number {
  let p = probabilityForStage(opts.stage);
  if (opts.hasDecisionMaker) p += 5;
  if (opts.buyingIntent === "high") p += 5;
  p -= Math.min(20, opts.openObjections * 5);
  p -= Math.min(15, opts.openRisks * 5);
  return Math.max(0, Math.min(100, Math.round(p)));
}

export function computeHealth(opts: {
  stage: string;
  stallDays: number;
  lastEngagementAt: Date | null;
  openObjections: number;
  openHighRisks: number;
  missingDecisionMaker: boolean;
}): string {
  if (opts.stage === "won") return "healthy";
  if (opts.stage === "lost") return "stalled";

  const daysSince = opts.lastEngagementAt
    ? (Date.now() - opts.lastEngagementAt.getTime()) / (24 * 60 * 60 * 1000)
    : 999;

  if (daysSince > opts.stallDays) return "stalled";
  if (opts.openHighRisks > 0 || (opts.missingDecisionMaker && opts.openObjections > 0)) return "at_risk";
  if (opts.openObjections > 0 || opts.missingDecisionMaker || daysSince > opts.stallDays / 2) return "watch";
  return "healthy";
}

export function attentionScore(opts: {
  health: string;
  probability: number;
  arr: number;
  actionOverdue: boolean;
}): number {
  let score = opts.probability;
  if (opts.health === "at_risk") score += 25;
  if (opts.health === "stalled") score += 35;
  if (opts.health === "watch") score += 10;
  if (opts.actionOverdue) score += 20;
  if (opts.arr > 10000) score += 10;
  return Math.min(100, score);
}

export async function findActiveDealForLeadOrCompany(opts: {
  productId: number;
  leadId?: number | null;
  companyId?: number | null;
}) {
  const closed = [...CLOSED_STAGES];
  if (opts.leadId) {
    const [byLead] = await db
      .select()
      .from(pipelineDealsTable)
      .where(and(
        eq(pipelineDealsTable.productId, opts.productId),
        eq(pipelineDealsTable.leadId, opts.leadId),
        notInArray(pipelineDealsTable.stage, closed),
      ))
      .limit(1);
    if (byLead) return byLead;
  }
  if (opts.companyId) {
    const [byCompany] = await db
      .select()
      .from(pipelineDealsTable)
      .where(and(
        eq(pipelineDealsTable.productId, opts.productId),
        eq(pipelineDealsTable.companyId, opts.companyId),
        notInArray(pipelineDealsTable.stage, closed),
      ))
      .limit(1);
    if (byCompany) return byCompany;
  }
  return null;
}

export type CreateOpportunityInput = {
  productId: number;
  leadId: number;
  source: string;
  sourceInboundId?: number | null;
  sequenceId?: number | null;
  stage?: PipelineStage;
  notes?: string | null;
  ownerUserId?: string | null;
};

export async function createOpportunity(input: CreateOpportunityInput) {
  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, input.leadId)).limit(1);
  if (!lead) throw new Error("Lead not found");

  const existing = await findActiveDealForLeadOrCompany({
    productId: input.productId,
    leadId: lead.id,
    companyId: lead.companyId,
  });
  if (existing) {
    await writeOppAudit({
      productId: input.productId,
      dealId: existing.id,
      leadId: lead.id,
      eventType: "create_skipped_duplicate",
      payload: { source: input.source },
    });
    return { deal: existing, created: false };
  }

  const stage = input.stage ?? "interested";
  const value = 0;
  const frequency = "monthly";
  const { mrr, arr } = computeMrrArr(value, frequency);
  const probability = probabilityForStage(stage);

  const [deal] = await db
    .insert(pipelineDealsTable)
    .values({
      productId: input.productId,
      leadId: lead.id,
      companyId: lead.companyId ?? null,
      ownerUserId: input.ownerUserId ?? lead.assignedToUserId ?? null,
      contactName: `${lead.firstName} ${lead.lastName}`.trim() || lead.email || "Unknown",
      companyName: lead.company,
      value: String(value),
      mrr,
      arr,
      stage,
      probability,
      health: "healthy",
      source: input.source,
      sourceInboundId: input.sourceInboundId ?? null,
      sequenceId: input.sequenceId ?? null,
      notes: input.notes ?? null,
      lastEngagementAt: new Date(),
      attentionScore: probability,
    })
    .returning();

  await db.insert(opportunityStageHistoryTable).values({
    dealId: deal.id,
    fromStage: null,
    toStage: stage,
    changeSource: input.source.startsWith("reply") ? "reply_agent" : "system",
    reason: `Opportunity created via ${input.source}`,
  });

  await db.insert(dealActivitiesTable).values({
    dealId: deal.id,
    kind: "system",
    content: `Opportunity created (${input.source}).`,
  });

  await db.insert(opportunityContactsTable).values({
    dealId: deal.id,
    leadId: lead.id,
    name: `${lead.firstName} ${lead.lastName}`.trim(),
    stakeholderRole: "primary",
    primaryContact: true,
  });

  await db.insert(opportunityQualificationTable).values({ dealId: deal.id });

  // Inherit pain hypothesis
  if (lead.companyId) {
    const [pain] = await db
      .select()
      .from(painHypothesesTable)
      .where(and(
        eq(painHypothesesTable.companyId, lead.companyId),
        eq(painHypothesesTable.productId, input.productId),
      ))
      .orderBy(painHypothesesTable.priority)
      .limit(1);
    await db.insert(opportunityIntelligenceTable).values({
      dealId: deal.id,
      primaryPain: pain?.painCategory ?? null,
      painSeverity: "hypothesis",
      summary: `New opportunity from ${input.source} for ${lead.company || lead.firstName}.`,
    });
  } else {
    await db.insert(opportunityIntelligenceTable).values({
      dealId: deal.id,
      summary: `New opportunity from ${input.source}.`,
    });
  }

  await writeOppAudit({
    productId: input.productId,
    dealId: deal.id,
    leadId: lead.id,
    eventType: "opportunity_created",
    payload: { source: input.source, stage },
  });

  await refreshDealEngines(deal.id);
  return { deal, created: true };
}

export async function maybeCreateFromReply(opts: {
  productId: number;
  leadId: number;
  classification: string;
  buyingIntent?: string | null;
  inboundId?: number | null;
  sequenceId?: number | null;
  objectionType?: string | null;
  summary?: string | null;
}) {
  const settings = await getOrCreateOppSettings(opts.productId);

  // Always capture objections on existing deals
  if (opts.classification === "OBJECTION") {
    const existing = await findActiveDealForLeadOrCompany({
      productId: opts.productId,
      leadId: opts.leadId,
    });
    if (existing) {
      await db.insert(opportunityObjectionsTable).values({
        dealId: existing.id,
        objectionType: opts.objectionType ?? "other",
        description: opts.summary ?? "Objection raised in reply",
        evidence: `inbound:${opts.inboundId ?? ""}`,
        status: "open",
      });
      await refreshDealEngines(existing.id);
    }
    return null;
  }

  if (!settings.autoCreateEnabled) return null;

  let shouldCreate = false;
  if (opts.classification === "BOOK_MEETING" && settings.triggerBookMeeting) shouldCreate = true;
  if (
    opts.classification === "INTERESTED" &&
    settings.triggerInterested &&
    (opts.buyingIntent === "high" || opts.buyingIntent === "medium" || !opts.buyingIntent)
  ) {
    shouldCreate = true;
  }
  if (opts.classification === "PRICING_QUESTION" && settings.triggerPricing) shouldCreate = true;

  if (!shouldCreate) return null;

  if (settings.requireNonRejectTier) {
    const [score] = await db
      .select()
      .from(leadScoresTable)
      .where(eq(leadScoresTable.leadId, opts.leadId))
      .limit(1);
    if (score?.tier === "Reject") {
      await writeOppAudit({
        productId: opts.productId,
        leadId: opts.leadId,
        eventType: "create_skipped_reject_tier",
        payload: { classification: opts.classification },
      });
      return null;
    }
  }

  const stage: PipelineStage =
    opts.classification === "BOOK_MEETING" ? "demo" : "interested";

  return createOpportunity({
    productId: opts.productId,
    leadId: opts.leadId,
    source: `reply:${opts.classification}`,
    sourceInboundId: opts.inboundId,
    sequenceId: opts.sequenceId,
    stage,
    notes: opts.summary,
  });
}

export async function changeDealStage(opts: {
  dealId: number;
  toStage: string;
  source: string;
  reason?: string;
  confidence?: number | null;
  lostReason?: string | null;
}) {
  if (!PIPELINE_STAGES.includes(opts.toStage as PipelineStage)) {
    throw new Error("Invalid stage");
  }
  const [deal] = await db.select().from(pipelineDealsTable).where(eq(pipelineDealsTable.id, opts.dealId)).limit(1);
  if (!deal) throw new Error("Deal not found");
  if (deal.stage === opts.toStage) return deal;

  const set: Record<string, unknown> = {
    stage: opts.toStage,
    probability: probabilityForStage(opts.toStage),
    lastEngagementAt: new Date(),
  };
  if (opts.toStage === "won") {
    set.wonAt = new Date();
    set.health = "healthy";
  }
  if (opts.toStage === "lost") {
    set.lostAt = new Date();
    set.lostReason = opts.lostReason ?? deal.lostReason;
    set.health = "stalled";
    if (opts.lostReason) {
      const [existingLost] = await db
        .select()
        .from(lostDealDetailsTable)
        .where(eq(lostDealDetailsTable.dealId, deal.id))
        .limit(1);
      if (existingLost) {
        await db
          .update(lostDealDetailsTable)
          .set({ reason: opts.lostReason, userConfirmed: true })
          .where(eq(lostDealDetailsTable.id, existingLost.id));
      } else {
        await db.insert(lostDealDetailsTable).values({
          dealId: deal.id,
          reason: opts.lostReason,
          userConfirmed: true,
        });
      }
    }
  }

  const [updated] = await db
    .update(pipelineDealsTable)
    .set(set)
    .where(eq(pipelineDealsTable.id, opts.dealId))
    .returning();

  await db.insert(opportunityStageHistoryTable).values({
    dealId: opts.dealId,
    fromStage: deal.stage,
    toStage: opts.toStage,
    changeSource: opts.source,
    aiConfidence: opts.confidence ?? null,
    reason: opts.reason ?? null,
  });

  await db.insert(dealActivitiesTable).values({
    dealId: opts.dealId,
    kind: "stage_change",
    content: `Stage ${deal.stage} → ${opts.toStage}${opts.reason ? `: ${opts.reason}` : ""}`,
  });

  await writeOppAudit({
    productId: deal.productId,
    dealId: deal.id,
    leadId: deal.leadId,
    eventType: "stage_changed",
    payload: { from: deal.stage, to: opts.toStage, source: opts.source },
  });

  await refreshDealEngines(opts.dealId);
  return updated;
}

export async function refreshDealEngines(dealId: number) {
  const [deal] = await db.select().from(pipelineDealsTable).where(eq(pipelineDealsTable.id, dealId)).limit(1);
  if (!deal || deal.stage === "won" || deal.stage === "lost") return;

  const settings = await getOrCreateOppSettings(deal.productId);
  const objections = await db
    .select()
    .from(opportunityObjectionsTable)
    .where(and(eq(opportunityObjectionsTable.dealId, dealId), eq(opportunityObjectionsTable.status, "open")));
  const risks = await db
    .select()
    .from(opportunityRisksTable)
    .where(and(eq(opportunityRisksTable.dealId, dealId), eq(opportunityRisksTable.status, "open")));
  const contacts = await db
    .select()
    .from(opportunityContactsTable)
    .where(eq(opportunityContactsTable.dealId, dealId));

  const hasDm = contacts.some((c) =>
    /decision|owner|director|ceo|founder|vp|chief/i.test(`${c.stakeholderRole ?? ""} ${c.name ?? ""}`),
  );
  const missingDm = !hasDm;

  // Rebuild deterministic risks
  await db.delete(opportunityRisksTable).where(and(
    eq(opportunityRisksTable.dealId, dealId),
    inArray(opportunityRisksTable.riskType, ["stalled", "missing_decision_maker", "open_objection"]),
  ));

  if (missingDm) {
    await db.insert(opportunityRisksTable).values({
      dealId,
      riskType: "missing_decision_maker",
      description: "No clear decision maker mapped yet",
      severity: "high",
      status: "open",
      recommendedMitigation: "Identify and engage the economic buyer",
    });
  }
  if (objections.length) {
    await db.insert(opportunityRisksTable).values({
      dealId,
      riskType: "open_objection",
      description: `${objections.length} open objection(s)`,
      severity: "medium",
      status: "open",
      recommendedMitigation: "Address objections with approved knowledge",
    });
  }

  const daysSince = deal.lastEngagementAt
    ? (Date.now() - new Date(deal.lastEngagementAt).getTime()) / (24 * 60 * 60 * 1000)
    : 999;
  if (daysSince > settings.stallDays) {
    await db.insert(opportunityRisksTable).values({
      dealId,
      riskType: "stalled",
      description: `No engagement for ${Math.floor(daysSince)} days`,
      severity: "high",
      status: "open",
      recommendedMitigation: "Re-engage with a short value-focused follow-up",
    });
  }

  const openRisks = await db
    .select()
    .from(opportunityRisksTable)
    .where(and(eq(opportunityRisksTable.dealId, dealId), eq(opportunityRisksTable.status, "open")));
  const highRisks = openRisks.filter((r) => r.severity === "high").length;

  const probability = adjustProbability({
    stage: deal.stage,
    hasDecisionMaker: hasDm,
    openObjections: objections.length,
    openRisks: openRisks.length,
  });

  const health = computeHealth({
    stage: deal.stage,
    stallDays: settings.stallDays,
    lastEngagementAt: deal.lastEngagementAt ? new Date(deal.lastEngagementAt) : null,
    openObjections: objections.length,
    openHighRisks: highRisks,
    missingDecisionMaker: missingDm,
  });

  const pendingActions = await db
    .select()
    .from(opportunityActionsTable)
    .where(and(eq(opportunityActionsTable.dealId, dealId), eq(opportunityActionsTable.status, "pending")));
  const overdue = pendingActions.some((a) => a.dueAt && new Date(a.dueAt) < new Date());

  const arr = parseFloat(deal.arr ?? deal.value ?? "0") || 0;
  const attention = attentionScore({ health, probability, arr, actionOverdue: overdue });

  // Qualification completeness
  const [qual] = await db
    .select()
    .from(opportunityQualificationTable)
    .where(eq(opportunityQualificationTable.dealId, dealId))
    .limit(1);
  if (qual) {
    const fields = [
      qual.problemStatus,
      qual.fitStatus,
      qual.authorityStatus,
      qual.commercialsStatus,
      qual.timingStatus,
      qual.nextStepStatus,
    ];
    const known = fields.filter((f) => f && f !== "unknown").length;
    const completeness = Math.round((known / fields.length) * 100);
    await db
      .update(opportunityQualificationTable)
      .set({ completenessScore: completeness })
      .where(eq(opportunityQualificationTable.id, qual.id));
  }

  // Ensure a next action exists
  const nextAction = suggestNextAction({
    stage: deal.stage,
    health,
    missingDm,
    openObjections: objections.length,
  });
  if (nextAction && pendingActions.length === 0) {
    const due = new Date();
    due.setDate(due.getDate() + (health === "stalled" ? 1 : 3));
    await db.insert(opportunityActionsTable).values({
      dealId,
      productId: deal.productId,
      actionType: nextAction.type,
      description: nextAction.description,
      dueAt: due,
      priority: attention,
      status: "pending",
      generatedBy: "rules",
    });
    await db
      .update(opportunityIntelligenceTable)
      .set({
        recommendedNextAction: nextAction.description,
        nextActionReason: nextAction.reason,
        nextActionDue: due,
        attentionPriority: attention,
      })
      .where(eq(opportunityIntelligenceTable.dealId, dealId));
  }

  await db
    .update(pipelineDealsTable)
    .set({
      probability,
      health,
      attentionScore: attention,
    })
    .where(eq(pipelineDealsTable.id, dealId));

  // Founder Daily Planner events
  try {
    const label = deal.companyName || deal.contactName || `Deal #${dealId}`;
    if (health === "at_risk" || health === "stalled") {
      await emitAgentEvent({
        productId: deal.productId,
        sourceAgent: "opportunity_agent",
        sourceEntityType: "pipeline_deal",
        sourceEntityId: dealId,
        eventType: health === "stalled" ? "deal_stalled" : "deal_at_risk",
        title: `${health === "stalled" ? "Stalled" : "At risk"}: ${label}`,
        description: nextAction?.description ?? `Deal health is ${health}`,
        commercialValue: arr > 100 ? arr : Math.min(100, Math.round(arr / 100) || attention),
        probability,
        urgency: health === "stalled" ? 90 : 80,
        humanDependency: 80,
        riskScore: health === "stalled" ? 85 : 75,
        strategicScore: 40,
        recommendedAction: nextAction?.description ?? "Re-engage this opportunity",
        actionType: nextAction?.type ?? "re_engage",
        executionType: "user_acts",
        payload: { health, attention, stage: deal.stage },
      });
    } else if (nextAction) {
      await emitAgentEvent({
        productId: deal.productId,
        sourceAgent: "opportunity_agent",
        sourceEntityType: "pipeline_deal",
        sourceEntityId: dealId,
        eventType: "deal_next_action",
        title: `Next: ${label}`,
        description: nextAction.description,
        commercialValue: arr > 100 ? arr : Math.min(100, Math.round(arr / 100) || attention),
        probability,
        urgency: overdue ? 85 : 55,
        humanDependency: 70,
        riskScore: highRisks * 15,
        strategicScore: 30,
        recommendedAction: nextAction.description,
        actionType: nextAction.type,
        executionType: "user_acts",
        payload: { health, attention, stage: deal.stage },
      });
    }
  } catch {
    // non-fatal
  }
}

function suggestNextAction(opts: {
  stage: string;
  health: string;
  missingDm: boolean;
  openObjections: number;
}): { type: string; description: string; reason: string } | null {
  if (opts.stage === "won" || opts.stage === "lost") return null;
  if (opts.health === "stalled") {
    return {
      type: "re_engage",
      description: "Send a short re-engagement note referencing their last interest",
      reason: "Deal appears stalled",
    };
  }
  if (opts.openObjections > 0) {
    return {
      type: "handle_objection",
      description: "Address the open objection with approved product knowledge",
      reason: "Unresolved objection",
    };
  }
  if (opts.missingDm) {
    return {
      type: "map_stakeholder",
      description: "Identify the decision maker and request an introduction",
      reason: "Missing decision maker",
    };
  }
  if (opts.stage === "interested" || opts.stage === "discovery") {
    return {
      type: "book_discovery",
      description: "Confirm discovery call or send booking link",
      reason: "Early-stage opportunity",
    };
  }
  if (opts.stage === "demo") {
    return {
      type: "follow_up_demo",
      description: "Follow up on demo outcomes and confirm next step",
      reason: "Post-demo progression",
    };
  }
  if (opts.stage === "proposal" || opts.stage === "decision") {
    return {
      type: "advance_proposal",
      description: "Check proposal status and clear remaining questions",
      reason: "Commercial stage",
    };
  }
  return {
    type: "check_in",
    description: "Check in and confirm timeline",
    reason: "Maintain momentum",
  };
}

export async function refreshAllActiveDeals(limit = 50): Promise<{ refreshed: number }> {
  const deals = await db
    .select({ id: pipelineDealsTable.id })
    .from(pipelineDealsTable)
    .where(notInArray(pipelineDealsTable.stage, [...CLOSED_STAGES]))
    .orderBy(desc(pipelineDealsTable.updatedAt))
    .limit(limit);
  for (const d of deals) {
    await refreshDealEngines(d.id);
  }
  return { refreshed: deals.length };
}

export async function getDealIntelligenceBundle(dealId: number) {
  const [deal] = await db.select().from(pipelineDealsTable).where(eq(pipelineDealsTable.id, dealId)).limit(1);
  if (!deal) return null;

  const [intel] = await db.select().from(opportunityIntelligenceTable).where(eq(opportunityIntelligenceTable.dealId, dealId)).limit(1);
  const [qual] = await db.select().from(opportunityQualificationTable).where(eq(opportunityQualificationTable.dealId, dealId)).limit(1);
  const contacts = await db.select().from(opportunityContactsTable).where(eq(opportunityContactsTable.dealId, dealId));
  const risks = await db.select().from(opportunityRisksTable).where(eq(opportunityRisksTable.dealId, dealId));
  const objections = await db.select().from(opportunityObjectionsTable).where(eq(opportunityObjectionsTable.dealId, dealId));
  const actions = await db.select().from(opportunityActionsTable).where(eq(opportunityActionsTable.dealId, dealId)).orderBy(desc(opportunityActionsTable.createdAt));
  const history = await db.select().from(opportunityStageHistoryTable).where(eq(opportunityStageHistoryTable.dealId, dealId)).orderBy(desc(opportunityStageHistoryTable.changedAt));
  const activities = await db.select().from(dealActivitiesTable).where(eq(dealActivitiesTable.dealId, dealId)).orderBy(desc(dealActivitiesTable.createdAt));
  const [lost] = await db.select().from(lostDealDetailsTable).where(eq(lostDealDetailsTable.dealId, dealId)).limit(1);

  let lead = null;
  let contactIntel = null;
  let score = null;
  let pains: unknown[] = [];
  let replies: unknown[] = [];

  if (deal.leadId) {
    const [l] = await db.select().from(leadsTable).where(eq(leadsTable.id, deal.leadId)).limit(1);
    lead = l ?? null;
    const [ci] = await db.select().from(contactIntelligenceTable).where(eq(contactIntelligenceTable.leadId, deal.leadId)).limit(1);
    contactIntel = ci ?? null;
    const [sc] = await db.select().from(leadScoresTable).where(eq(leadScoresTable.leadId, deal.leadId)).limit(1);
    score = sc ?? null;

    const inbound = await db
      .select({
        message: inboundMessagesTable,
        analysis: replyAnalysesTable,
      })
      .from(inboundMessagesTable)
      .leftJoin(replyAnalysesTable, eq(replyAnalysesTable.inboundMessageId, inboundMessagesTable.id))
      .where(eq(inboundMessagesTable.leadId, deal.leadId))
      .orderBy(desc(inboundMessagesTable.receivedAt))
      .limit(20);
    replies = inbound;
  }

  if (deal.companyId) {
    pains = await db
      .select()
      .from(painHypothesesTable)
      .where(and(eq(painHypothesesTable.companyId, deal.companyId), eq(painHypothesesTable.productId, deal.productId)));
  }

  const audit = await db
    .select()
    .from(opportunityAgentAuditTable)
    .where(eq(opportunityAgentAuditTable.dealId, dealId))
    .orderBy(desc(opportunityAgentAuditTable.createdAt))
    .limit(50);

  return {
    deal,
    intelligence: intel ?? null,
    qualification: qual ?? null,
    contacts,
    risks,
    objections,
    actions,
    stageHistory: history,
    activities,
    lostDetails: lost ?? null,
    lead,
    contactIntelligence: contactIntel,
    leadScore: score,
    pains,
    replies,
    audit,
  };
}
