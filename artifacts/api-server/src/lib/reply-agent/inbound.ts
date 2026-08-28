/**
 * Capture Resend inbound emails, match to leads, pause sequences, enqueue processing.
 */
import { Resend } from "resend";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { inboundMessagesTable } from "@workspace/db/schema";
import { logger } from "../logger";
import {
  getOrCreateReplySettings,
  matchInboundToSend,
  normalizeEmail,
  pauseSequenceForLead,
  writeReplyAudit,
} from "./helpers";
import { processInboundMessage } from "./processor";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

export type ReceivedWebhookData = {
  email_id?: string;
  from?: string;
  to?: string[];
  subject?: string;
  message_id?: string;
  created_at?: string;
};

export async function handleInboundReceived(data: ReceivedWebhookData): Promise<{
  stored: boolean;
  inboundId?: number;
  duplicate?: boolean;
}> {
  const emailId = data.email_id;
  if (!emailId) return { stored: false };

  const [existing] = await db
    .select({ id: inboundMessagesTable.id })
    .from(inboundMessagesTable)
    .where(eq(inboundMessagesTable.externalEmailId, emailId))
    .limit(1);
  if (existing) return { stored: true, inboundId: existing.id, duplicate: true };

  const resend = getResend();
  if (!resend) {
    logger.warn("Inbound email received but RESEND_API_KEY missing");
    return { stored: false };
  }

  const { data: full, error } = await resend.emails.receiving.get(emailId);
  if (error || !full) {
    logger.warn({ error, emailId }, "Failed to fetch inbound email content");
    throw new Error("Failed to fetch inbound email");
  }

  const headers: Record<string, string> = {};
  if (full.headers && typeof full.headers === "object") {
    for (const [k, v] of Object.entries(full.headers as Record<string, unknown>)) {
      if (typeof v === "string") headers[k] = v;
    }
  }

  const sender = normalizeEmail(full.from ?? data.from) ?? String(full.from ?? data.from ?? "unknown");
  const recipients = [
    ...(Array.isArray(full.to) ? full.to : []),
    ...(Array.isArray(data.to) ? data.to : []),
    ...((full as { received_for?: string[] }).received_for ?? []),
  ].map(String);

  const match = await matchInboundToSend({
    recipients,
    sender,
    headers,
  });

  const threadId =
    headers["in-reply-to"] ??
    headers["In-Reply-To"] ??
    full.message_id ??
    data.message_id ??
    emailId;

  const [row] = await db
    .insert(inboundMessagesTable)
    .values({
      productId: match.productId,
      leadId: match.leadId,
      companyId: match.companyId,
      sequenceId: match.sequenceId,
      outboundSendId: match.outboundSendId,
      threadId: String(threadId),
      externalEmailId: emailId,
      externalMessageId: full.message_id ?? data.message_id ?? null,
      subject: full.subject ?? data.subject ?? null,
      bodyText: full.text ?? null,
      bodyHtml: full.html ?? null,
      sender,
      recipient: recipients[0] ?? null,
      headersJson: headers,
      matchMethod: match.matchMethod,
      processingStatus: "pending",
      inboxBucket: "all",
      receivedAt: data.created_at ? new Date(data.created_at) : new Date(),
    })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    const [again] = await db
      .select({ id: inboundMessagesTable.id })
      .from(inboundMessagesTable)
      .where(eq(inboundMessagesTable.externalEmailId, emailId))
      .limit(1);
    return { stored: true, inboundId: again?.id, duplicate: true };
  }

  await writeReplyAudit({
    productId: match.productId,
    leadId: match.leadId,
    inboundMessageId: row.id,
    eventType: "inbound_captured",
    payload: { matchMethod: match.matchMethod, emailId },
  });

  if (match.leadId && match.productId) {
    const settings = await getOrCreateReplySettings(match.productId);
    if (settings.autoPauseOnReply) {
      const paused = await pauseSequenceForLead({
        leadId: match.leadId,
        sequenceId: match.sequenceId,
        cancel: false,
        reason: "inbound_reply",
      });
      await writeReplyAudit({
        productId: match.productId,
        leadId: match.leadId,
        inboundMessageId: row.id,
        eventType: "sequence_paused",
        payload: { paused },
      });
    }
  }

  // Process async after webhook ack path — fire and forget with logging
  void processInboundMessage(row.id).catch((err) => {
    logger.error({ err, inboundId: row.id }, "Inbound reply processing failed");
  });

  return { stored: true, inboundId: row.id };
}
