/**
 * AI Reply Agent helpers: settings, audit, matching, pause, process inbound.
 */
import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  emailSendsTable,
  inboundMessagesTable,
  leadsTable,
  productAiReplySettingsTable,
  replyAgentAuditTable,
  suppressionListTable,
} from "@workspace/db/schema";

export type AiReplySettings = typeof productAiReplySettingsTable.$inferSelect;

export const DEFAULT_REPLY_SETTINGS = {
  autoProcessReplies: true,
  autoPauseOnReply: true,
  autoSendHighConfidence: false,
  autoHandleOoo: true,
  autoHandleUnsubscribe: true,
  autoHandleNotInterested: true,
  autoAnswerProductQuestions: false,
  autoAnswerPricing: false,
  autoSendMeetingLink: false,
  minConfidenceAutoSend: 95,
  minConfidenceDraft: 70,
  defaultNotNowDays: 30,
  defaultOooFollowUpDays: 2,
  bookingLink: null as string | null,
};

export async function getOrCreateReplySettings(productId: number): Promise<AiReplySettings> {
  const [existing] = await db
    .select()
    .from(productAiReplySettingsTable)
    .where(eq(productAiReplySettingsTable.productId, productId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(productAiReplySettingsTable)
    .values({ productId, ...DEFAULT_REPLY_SETTINGS })
    .returning();
  return created;
}

export async function writeReplyAudit(event: {
  productId?: number | null;
  leadId?: number | null;
  inboundMessageId?: number | null;
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  await db.insert(replyAgentAuditTable).values({
    productId: event.productId ?? null,
    leadId: event.leadId ?? null,
    inboundMessageId: event.inboundMessageId ?? null,
    eventType: event.eventType,
    payload: event.payload ?? null,
  });
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const bare = value.match(/<([^>]+)>/)?.[1] ?? value;
  const email = bare.trim().toLowerCase();
  return email.includes("@") ? email : null;
}

export function parsePlusSendId(recipient: string | null | undefined): number | null {
  const email = normalizeEmail(recipient);
  if (!email) return null;
  const local = email.split("@")[0] ?? "";
  const m = local.match(/(?:^|\+)s(\d+)$/i) ?? local.match(/^reply\+s(\d+)$/i);
  if (!m) return null;
  const id = Number.parseInt(m[1], 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function extractMessageIds(headers: Record<string, string> | null | undefined): string[] {
  if (!headers) return [];
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  const blob = [lower["in-reply-to"], lower["references"]].filter(Boolean).join(" ");
  const ids = [...blob.matchAll(/<[^>]+>/g)].map((m) => m[0]);
  return [...new Set(ids)];
}

export function inboundReplyToAddress(sendId: number): string | null {
  // Prefer explicit inbound config; otherwise derive from RESEND_FROM_SALES
  // e.g. "Sales Manager <salesmanager@creativecloud.ai>" → salesmanager+s123@creativecloud.ai
  let local = process.env.RESEND_INBOUND_LOCAL?.trim();
  let domain = process.env.RESEND_INBOUND_DOMAIN?.trim();

  if (!domain || !local) {
    const sales = normalizeEmail(
      process.env.RESEND_FROM_SALES?.trim() ||
        process.env.RESEND_FROM?.trim() ||
        "salesmanager@creativecloud.ai",
    );
    if (sales) {
      const [salesLocal, salesDomain] = sales.split("@");
      if (!local && salesLocal) local = salesLocal;
      if (!domain && salesDomain) domain = salesDomain;
    }
  }

  if (!domain || !local) return null;
  return `${local}+s${sendId}@${domain}`;
}

export type MatchResult = {
  leadId: number | null;
  productId: number | null;
  companyId: number | null;
  sequenceId: number | null;
  outboundSendId: number | null;
  matchMethod: string | null;
};

export async function matchInboundToSend(opts: {
  recipients: string[];
  sender: string;
  headers: Record<string, string>;
}): Promise<MatchResult> {
  const empty: MatchResult = {
    leadId: null,
    productId: null,
    companyId: null,
    sequenceId: null,
    outboundSendId: null,
    matchMethod: null,
  };

  for (const recipient of opts.recipients) {
    const sendId = parsePlusSendId(recipient);
    if (!sendId) continue;
    const [send] = await db.select().from(emailSendsTable).where(eq(emailSendsTable.id, sendId)).limit(1);
    if (!send?.leadId) continue;
    const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, send.leadId)).limit(1);
    return {
      leadId: send.leadId,
      productId: lead?.productId ?? null,
      companyId: lead?.companyId ?? null,
      sequenceId: send.sequenceId ?? null,
      outboundSendId: send.id,
      matchMethod: "reply_to_token",
    };
  }

  const messageIds = extractMessageIds(opts.headers);
  if (messageIds.length) {
    const [send] = await db
      .select()
      .from(emailSendsTable)
      .where(inArray(emailSendsTable.rfcMessageId, messageIds))
      .orderBy(desc(emailSendsTable.sentAt))
      .limit(1);
    if (send?.leadId) {
      const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, send.leadId)).limit(1);
      return {
        leadId: send.leadId,
        productId: lead?.productId ?? null,
        companyId: lead?.companyId ?? null,
        sequenceId: send.sequenceId ?? null,
        outboundSendId: send.id,
        matchMethod: "in_reply_to",
      };
    }
  }

  const senderEmail = normalizeEmail(opts.sender);
  if (senderEmail) {
    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(ilike(leadsTable.email, senderEmail))
      .limit(1);
    if (lead) {
      const [recent] = await db
        .select()
        .from(emailSendsTable)
        .where(and(eq(emailSendsTable.leadId, lead.id), eq(emailSendsTable.status, "sent")))
        .orderBy(desc(emailSendsTable.sentAt))
        .limit(1);
      return {
        leadId: lead.id,
        productId: lead.productId ?? null,
        companyId: lead.companyId ?? null,
        sequenceId: recent?.sequenceId ?? null,
        outboundSendId: recent?.id ?? null,
        matchMethod: "sender_email",
      };
    }
  }

  return empty;
}

/** Pause/cancel remaining scheduled sequence emails for a lead after a reply. */
export async function pauseSequenceForLead(opts: {
  leadId: number;
  sequenceId?: number | null;
  cancel?: boolean;
  reason?: string;
}): Promise<number> {
  const status = opts.cancel ? "cancelled" : "paused";
  const conditions = [
    eq(emailSendsTable.leadId, opts.leadId),
    inArray(emailSendsTable.status, ["scheduled", "paused"]),
  ];
  if (opts.sequenceId) {
    conditions.push(eq(emailSendsTable.sequenceId, opts.sequenceId));
  } else {
    conditions.push(sql`${emailSendsTable.sequenceId} IS NOT NULL`);
  }
  const updated = await db
    .update(emailSendsTable)
    .set({
      status,
      errorMessage: opts.reason ?? "inbound_reply",
    })
    .where(and(...conditions))
    .returning({ id: emailSendsTable.id });
  return updated.length;
}

export async function suppressEmail(opts: {
  email: string;
  productId?: number | null;
  leadId?: number | null;
  reason: string;
  source: string;
}) {
  const email = normalizeEmail(opts.email);
  if (!email) return;

  if (opts.leadId) {
    await db
      .update(leadsTable)
      .set({
        unsubscribedAt: new Date(),
        unsubscribeSource: opts.source,
        status: "not_interested",
      })
      .where(eq(leadsTable.id, opts.leadId));
    await db
      .update(emailSendsTable)
      .set({ status: "cancelled", errorMessage: opts.reason })
      .where(and(eq(emailSendsTable.leadId, opts.leadId), eq(emailSendsTable.status, "scheduled")));
  }

  await db
    .insert(suppressionListTable)
    .values({
      email,
      productId: opts.productId ?? null,
      reason: opts.reason,
      source: opts.source,
    })
    .onConflictDoNothing();
}

export function classificationToBucket(classification: string): string {
  switch (classification) {
    case "INTERESTED":
    case "SEND_INFORMATION":
    case "BOOK_MEETING":
    case "PRICING_QUESTION":
    case "PRODUCT_QUESTION":
      return "interested";
    case "NOT_NOW":
      return "follow_up";
    case "NOT_INTERESTED":
      return "not_interested";
    case "UNSUBSCRIBE":
      return "unsubscribed";
    case "OUT_OF_OFFICE":
    case "AUTOMATED_REPLY":
      return "ooo";
    case "COMPLAINT":
    case "UNKNOWN":
    case "OBJECTION":
    case "WRONG_PERSON":
    case "REFERRAL":
    case "EXISTING_CUSTOMER":
      return "needs_attention";
    default:
      return "needs_attention";
  }
}
