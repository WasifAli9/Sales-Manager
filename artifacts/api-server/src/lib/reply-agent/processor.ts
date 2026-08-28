/**
 * Deterministic action engine after classification + optional draft/auto-send.
 */
import { and, eq, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  aiReplyDraftsTable,
  followUpsTable,
  inboundMessagesTable,
  leadsTable,
  replyAnalysesTable,
} from "@workspace/db/schema";
import { logger } from "../logger";
import { sendEmail, salesFromEmail } from "../email";
import { classifyInboundMessage } from "./classify";
import { generateReplyDraft } from "./draft";
import {
  classificationToBucket,
  getOrCreateReplySettings,
  suppressEmail,
  writeReplyAudit,
} from "./helpers";
import { maybeCreateFromReply } from "../opportunity-agent/service";
import { emitAgentEvent } from "../founder-planner/service";

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function parseReturnDate(value: string | null | undefined, fallbackDays: number): Date {
  if (value) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return addDays(new Date(), fallbackDays);
}

export async function processInboundMessage(inboundId: number): Promise<void> {
  const [msg] = await db.select().from(inboundMessagesTable).where(eq(inboundMessagesTable.id, inboundId)).limit(1);
  if (!msg) return;

  if (!msg.productId) {
    await db
      .update(inboundMessagesTable)
      .set({
        processingStatus: "needs_attention",
        inboxBucket: "needs_attention",
        processedAt: new Date(),
      })
      .where(eq(inboundMessagesTable.id, inboundId));
    return;
  }

  const settings = await getOrCreateReplySettings(msg.productId);
  if (!settings.autoProcessReplies) {
    await db
      .update(inboundMessagesTable)
      .set({
        processingStatus: "needs_attention",
        inboxBucket: "needs_attention",
        processedAt: new Date(),
      })
      .where(eq(inboundMessagesTable.id, inboundId));
    return;
  }

  let analysis;
  try {
    analysis = await classifyInboundMessage(inboundId);
  } catch (err) {
    logger.error({ err, inboundId }, "Classification threw");
    await db
      .update(inboundMessagesTable)
      .set({
        processingStatus: "failed",
        inboxBucket: "needs_attention",
        processedAt: new Date(),
      })
      .where(eq(inboundMessagesTable.id, inboundId));
    return;
  }

  if (!analysis) return;

  const classification = analysis.classification;
  let bucket = classificationToBucket(classification);
  let aiHandled = false;
  let needsAttention = analysis.confidence < settings.minConfidenceDraft || analysis.requiresApproval;

  // Safe autonomous actions
  if (classification === "UNSUBSCRIBE") {
    if (msg.leadId || msg.sender) {
      await suppressEmail({
        email: msg.sender,
        productId: msg.productId,
        leadId: msg.leadId,
        reason: "inbound_unsubscribe",
        source: "reply_agent",
      });
    }
    bucket = "unsubscribed";
    aiHandled = true;
    needsAttention = false;
  }

  if (classification === "NOT_INTERESTED" && settings.autoHandleNotInterested) {
    if (msg.leadId) {
      await db
        .update(leadsTable)
        .set({ status: "not_interested" })
        .where(eq(leadsTable.id, msg.leadId));
    }
    bucket = "not_interested";
    aiHandled = true;
    needsAttention = false;
  }

  if ((classification === "OUT_OF_OFFICE" || classification === "AUTOMATED_REPLY") && settings.autoHandleOoo) {
    const when = parseReturnDate(analysis.returnDate, settings.defaultOooFollowUpDays);
    await db.insert(followUpsTable).values({
      productId: msg.productId,
      leadId: msg.leadId,
      inboundMessageId: inboundId,
      threadId: msg.threadId,
      scheduledAt: when,
      reason: `OOO follow-up (${classification})`,
      status: "pending",
      createdBy: "ai",
    });
    bucket = "ooo";
    aiHandled = true;
    needsAttention = false;
  }

  if (classification === "NOT_NOW") {
    const days = analysis.followUpDays ?? settings.defaultNotNowDays;
    await db.insert(followUpsTable).values({
      productId: msg.productId,
      leadId: msg.leadId,
      inboundMessageId: inboundId,
      threadId: msg.threadId,
      scheduledAt: addDays(new Date(), days),
      reason: analysis.summary ?? "Not now — scheduled follow-up",
      status: "pending",
      createdBy: "ai",
    });
    bucket = "follow_up";
    aiHandled = true;
    needsAttention = analysis.confidence < 70;
  }

  const shouldDraft =
    analysis.requiresResponse &&
    !["UNSUBSCRIBE", "OUT_OF_OFFICE", "AUTOMATED_REPLY", "NOT_INTERESTED"].includes(classification) &&
    analysis.confidence >= settings.minConfidenceDraft;

  let draft = null;
  if (shouldDraft) {
    try {
      draft = await generateReplyDraft(inboundId);
    } catch (err) {
      logger.warn({ err, inboundId }, "Draft generation failed");
      needsAttention = true;
    }
  }

  // High-confidence auto-send (opt-in)
  const canAutoSend =
    settings.autoSendHighConfidence &&
    draft &&
    analysis.confidence >= settings.minConfidenceAutoSend &&
    !analysis.requiresApproval &&
    !(classification === "PRICING_QUESTION" && !settings.autoAnswerPricing) &&
    !(classification === "PRODUCT_QUESTION" && !settings.autoAnswerProductQuestions) &&
    !(classification === "BOOK_MEETING" && !settings.autoSendMeetingLink);

  if (canAutoSend && draft && msg.leadId) {
    const sent = await sendApprovedDraft(draft.id, null);
    if (sent) {
      aiHandled = true;
      needsAttention = false;
      bucket = classificationToBucket(classification);
      if (bucket === "needs_attention") bucket = "ai_handled";
      else if (bucket === "interested") bucket = "ai_handled";
    }
  }

  if (needsAttention) bucket = "needs_attention";
  else if (aiHandled && !["unsubscribed", "ooo", "follow_up", "not_interested"].includes(bucket)) {
    bucket = "ai_handled";
  }

  // Opportunity Agent trigger (deduped)
  if (msg.leadId && msg.productId) {
    try {
      await maybeCreateFromReply({
        productId: msg.productId,
        leadId: msg.leadId,
        classification,
        buyingIntent: analysis.buyingIntent,
        inboundId: inboundId,
        sequenceId: msg.sequenceId,
        objectionType: analysis.objectionType,
        summary: analysis.summary,
      });
    } catch (err) {
      logger.warn({ err, inboundId }, "Opportunity create from reply failed");
    }
  }

  await db
    .update(inboundMessagesTable)
    .set({
      processingStatus: needsAttention ? "needs_attention" : "actioned",
      inboxBucket: bucket,
      processedAt: new Date(),
    })
    .where(eq(inboundMessagesTable.id, inboundId));

  await writeReplyAudit({
    productId: msg.productId,
    leadId: msg.leadId,
    inboundMessageId: inboundId,
    eventType: "actions_applied",
    payload: { classification, bucket, aiHandled, needsAttention, draftId: draft?.id },
  });

  // Founder Daily Planner events
  try {
    const rawIntent = analysis.buyingIntent;
    const intentNum = (() => {
      if (rawIntent == null) return 0;
      const n = Number(rawIntent);
      if (!Number.isNaN(n)) return n;
      const s = String(rawIntent).toLowerCase();
      if (s.includes("high") || s === "hot") return 85;
      if (s.includes("medium") || s === "warm") return 55;
      if (s.includes("low") || s === "cold") return 25;
      return 0;
    })();
    const isComplaint = classification === "COMPLAINT" || /complaint|angry|lawsuit|cancel/i.test(analysis.summary ?? "");
    const isHighIntent =
      intentNum >= 70 ||
      ["BOOK_MEETING", "INTERESTED", "PRICING_QUESTION"].includes(classification);

    if (isComplaint) {
      await emitAgentEvent({
        productId: msg.productId,
        sourceAgent: "reply_agent",
        sourceEntityType: "inbound_message",
        sourceEntityId: inboundId,
        eventType: "reply_complaint",
        title: `Complaint / risk reply needs attention`,
        description: analysis.summary ?? msg.subject ?? undefined,
        commercialValue: 40,
        probability: 40,
        urgency: 95,
        humanDependency: 95,
        riskScore: 90,
        strategicScore: 10,
        confidence: analysis.confidence,
        recommendedAction: "Review and respond carefully",
        actionType: "handle_objection",
        executionType: "user_acts",
        payload: { classification, draftId: draft?.id },
      });
    } else if (needsAttention || (draft && draft.status === "pending")) {
      await emitAgentEvent({
        productId: msg.productId,
        sourceAgent: "reply_agent",
        sourceEntityType: "inbound_message",
        sourceEntityId: inboundId,
        eventType: isHighIntent ? "reply_high_intent" : "reply_needs_approval",
        title: isHighIntent
          ? `High-intent reply: ${classification.replace(/_/g, " ").toLowerCase()}`
          : `Reply needs approval`,
        description: analysis.summary ?? msg.subject ?? undefined,
        commercialValue: isHighIntent ? 80 : 50,
        probability: Math.min(95, 40 + Math.round(intentNum / 2)),
        urgency: isHighIntent ? 85 : 70,
        humanDependency: 85,
        riskScore: classification === "OBJECTION" ? 55 : 20,
        strategicScore: 15,
        confidence: analysis.confidence,
        recommendedAction: draft ? "Approve or edit AI reply draft" : "Review inbound and decide next step",
        actionType: "approve_reply",
        executionType: "user_approves",
        payload: { classification, draftId: draft?.id, buyingIntent: rawIntent },
      });
    } else if (aiHandled) {
      await emitAgentEvent({
        productId: msg.productId,
        sourceAgent: "reply_agent",
        sourceEntityType: "inbound_message",
        sourceEntityId: inboundId,
        eventType: "reply_ai_handled",
        title: `SM handled: ${classification.replace(/_/g, " ").toLowerCase()}`,
        description: analysis.summary ?? undefined,
        commercialValue: 30,
        urgency: 20,
        humanDependency: 10,
        riskScore: 5,
        executionType: "ai_handles",
        actionType: "auto_reply",
        payload: { classification, draftId: draft?.id },
      });
    }
  } catch (err) {
    logger.warn({ err, inboundId }, "Founder planner emit from reply failed");
  }
}

export async function sendApprovedDraft(
  draftId: number,
  userId: string | null,
): Promise<boolean> {
  const [draft] = await db.select().from(aiReplyDraftsTable).where(eq(aiReplyDraftsTable.id, draftId)).limit(1);
  if (!draft || draft.status === "sent") return draft?.status === "sent";

  const [msg] = await db
    .select()
    .from(inboundMessagesTable)
    .where(eq(inboundMessagesTable.id, draft.inboundMessageId))
    .limit(1);
  if (!msg?.leadId) {
    await db
      .update(aiReplyDraftsTable)
      .set({ errorMessage: "No matched lead" })
      .where(eq(aiReplyDraftsTable.id, draftId));
    return false;
  }

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, msg.leadId)).limit(1);
  if (!lead?.email || lead.unsubscribedAt) {
    await db
      .update(aiReplyDraftsTable)
      .set({ status: "cancelled", errorMessage: "Lead unsubscribed or missing email" })
      .where(eq(aiReplyDraftsTable.id, draftId));
    return false;
  }

  // Idempotency: another sent draft for this inbound?
  const [already] = await db
    .select()
    .from(aiReplyDraftsTable)
    .where(and(eq(aiReplyDraftsTable.inboundMessageId, msg.id), eq(aiReplyDraftsTable.status, "sent")))
    .limit(1);
  if (already && already.id !== draftId) return true;

  const subject = draft.subject || `Re: ${msg.subject ?? ""}`;
  const html = `<div style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(draft.body)}</div>`;
  const headers: Record<string, string> = {};
  if (msg.externalMessageId) {
    headers["In-Reply-To"] = msg.externalMessageId;
    headers.References = msg.externalMessageId;
  }

  const result = await sendEmail({
    to: lead.email,
    subject,
    html,
    text: draft.body,
    from: salesFromEmail(),
    headers: Object.keys(headers).length ? headers : undefined,
  });

  if (!result.ok) {
    await db
      .update(aiReplyDraftsTable)
      .set({ errorMessage: result.error })
      .where(eq(aiReplyDraftsTable.id, draftId));
    return false;
  }

  await db
    .update(aiReplyDraftsTable)
    .set({
      status: "sent",
      sentAt: new Date(),
      approvedAt: new Date(),
      editedByUser: userId,
    })
    .where(eq(aiReplyDraftsTable.id, draftId));

  await db
    .update(inboundMessagesTable)
    .set({ inboxBucket: "ai_handled", processingStatus: "actioned" })
    .where(eq(inboundMessagesTable.id, msg.id));

  await writeReplyAudit({
    productId: msg.productId,
    leadId: msg.leadId,
    inboundMessageId: msg.id,
    eventType: "draft_sent",
    payload: { draftId, resendId: result.id, userId },
  });

  return true;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Mark due follow-ups and push related inbound into Needs Attention. */
export async function processDueFollowUps(): Promise<{ due: number }> {
  const now = new Date();
  const due = await db
    .select()
    .from(followUpsTable)
    .where(and(eq(followUpsTable.status, "pending"), lte(followUpsTable.scheduledAt, now)));

  for (const fu of due) {
    await db
      .update(followUpsTable)
      .set({ status: "due", notifiedAt: now })
      .where(eq(followUpsTable.id, fu.id));

    if (fu.inboundMessageId) {
      await db
        .update(inboundMessagesTable)
        .set({ inboxBucket: "needs_attention", processingStatus: "needs_attention" })
        .where(eq(inboundMessagesTable.id, fu.inboundMessageId));
    }

    await writeReplyAudit({
      productId: fu.productId,
      leadId: fu.leadId,
      inboundMessageId: fu.inboundMessageId,
      eventType: "follow_up_due",
      payload: { followUpId: fu.id, reason: fu.reason },
    });
  }

  return { due: due.length };
}
