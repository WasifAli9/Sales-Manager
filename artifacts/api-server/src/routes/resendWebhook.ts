import type { Request, Response } from "express";
import { Resend } from "resend";
import { eq, sql } from "drizzle-orm";
import { db, emailSendsTable, emailTrackingEventsTable } from "@workspace/db";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}
const TRACKED_EVENT_TYPES = new Set([
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
]);
const SEND_MAPPING_RETRY_WINDOW_MS = 15 * 60 * 1000;

type TrackedEventType = "email.delivered" | "email.opened" | "email.clicked" | "email.bounced";

interface WebhookEmailData {
  email_id?: string;
  click?: { link?: string };
  bounce?: { type?: string; subType?: string; message?: string };
}

function eventDate(createdAt: string): Date {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

/**
 * Receives Resend's signed delivery/engagement events.
 * This handler must be registered ahead of express.json() so the SDK can
 * verify the exact bytes Resend signed.
 */
export async function handleResendWebhook(req: Request, res: Response): Promise<void> {
  const resend = getResend();
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!resend || !webhookSecret) {
    req.log.error("Resend webhook received without RESEND_WEBHOOK_SECRET configured");
    res.status(503).json({ error: "Email tracking is not configured" });
    return;
  }

  const svixId = req.header("svix-id");
  const svixTimestamp = req.header("svix-timestamp");
  const svixSignature = req.header("svix-signature");
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : typeof req.body === "string"
      ? req.body
      : "";

  if (!svixId || !svixTimestamp || !svixSignature || !rawBody) {
    req.log.warn("Resend webhook rejected: required signature headers or raw body missing");
    res.status(400).json({ error: "Invalid webhook request" });
    return;
  }

  let event: { type: string; created_at: string; data: WebhookEmailData };
  try {
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret,
    }) as typeof event;
  } catch {
    req.log.warn("Resend webhook rejected: signature verification failed");
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  if (!TRACKED_EVENT_TYPES.has(event.type)) {
    res.sendStatus(204);
    return;
  }

  const trackedType = event.type as TrackedEventType;
  const resendId = event.data.email_id;
  if (!resendId) {
    req.log.warn({ eventType: event.type, providerEventId: svixId }, "Resend webhook missing email ID");
    res.status(400).json({ error: "Webhook email ID missing" });
    return;
  }

  const occurredAt = eventDate(event.created_at);
  const [send] = await db
    .select({ id: emailSendsTable.id })
    .from(emailSendsTable)
    .where(eq(emailSendsTable.resendId, resendId))
    .limit(1);

  // The event may refer to an unrelated Resend email sent outside Closer.
  // Acknowledge it so Resend does not retry it, but never create orphan data.
  if (!send) {
    const eventAgeMs = Date.now() - occurredAt.getTime();
    if (eventAgeMs < SEND_MAPPING_RETRY_WINDOW_MS) {
      // A delivery event can arrive before the immediate-send path persists
      // the Resend message ID. Returning 5xx asks Resend to retry instead of
      // permanently losing a legitimate event in that short mapping window.
      req.log.warn(
        { eventType: event.type, providerEventId: svixId, resendId },
        "Resend email event arrived before send mapping was available",
      );
      res.status(503).json({ error: "Email send mapping not ready; retry shortly" });
      return;
    }

    req.log.info({ eventType: event.type, providerEventId: svixId }, "Ignoring unrecognized Resend email event");
    res.sendStatus(204);
    return;
  }

  const clickUrl = trackedType === "email.clicked" ? event.data.click?.link ?? null : null;
  const bounce = trackedType === "email.bounced" ? event.data.bounce : undefined;
  const bounceType = bounce ? [bounce.type, bounce.subType].filter(Boolean).join("/") || null : null;
  const bounceMessage = bounce?.message ?? null;

  const inserted = await db.transaction(async (tx) => {
    const created = await tx
      .insert(emailTrackingEventsTable)
      .values({
        emailSendId: send.id,
        providerEventId: svixId,
        eventType: trackedType,
        occurredAt,
        clickUrl,
        bounceType,
        bounceMessage,
        payload: event as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing({ target: emailTrackingEventsTable.providerEventId })
      .returning({ id: emailTrackingEventsTable.id });

    if (created.length === 0) return false;

    if (trackedType === "email.delivered") {
      await tx
        .update(emailSendsTable)
        .set({ deliveredAt: sql`coalesce(${emailSendsTable.deliveredAt}, ${occurredAt})` })
        .where(eq(emailSendsTable.id, send.id));
    } else if (trackedType === "email.opened") {
      await tx
        .update(emailSendsTable)
        .set({
          openedAt: sql`case
            when ${emailSendsTable.openedAt} is null or ${emailSendsTable.openedAt} > ${occurredAt}
            then ${occurredAt}
            else ${emailSendsTable.openedAt}
          end`,
          lastOpenedAt: sql`case
            when ${emailSendsTable.lastOpenedAt} is null or ${emailSendsTable.lastOpenedAt} < ${occurredAt}
            then ${occurredAt}
            else ${emailSendsTable.lastOpenedAt}
          end`,
          openCount: sql`${emailSendsTable.openCount} + 1`,
        })
        .where(eq(emailSendsTable.id, send.id));
    } else if (trackedType === "email.clicked") {
      await tx
        .update(emailSendsTable)
        .set({
          clickedAt: sql`case
            when ${emailSendsTable.clickedAt} is null or ${emailSendsTable.clickedAt} > ${occurredAt}
            then ${occurredAt}
            else ${emailSendsTable.clickedAt}
          end`,
          lastClickedAt: sql`case
            when ${emailSendsTable.lastClickedAt} is null or ${emailSendsTable.lastClickedAt} < ${occurredAt}
            then ${occurredAt}
            else ${emailSendsTable.lastClickedAt}
          end`,
          clickCount: sql`${emailSendsTable.clickCount} + 1`,
          lastClickedUrl: clickUrl,
        })
        .where(eq(emailSendsTable.id, send.id));
    } else if (trackedType === "email.bounced") {
      await tx
        .update(emailSendsTable)
        .set({
          bouncedAt: sql`coalesce(${emailSendsTable.bouncedAt}, ${occurredAt})`,
          bounceType,
          bounceMessage,
        })
        .where(eq(emailSendsTable.id, send.id));
    }

    return true;
  });

  req.log.info(
    { eventType: trackedType, emailSendId: send.id, providerEventId: svixId, duplicate: !inserted },
    "Resend tracking event processed",
  );
  res.status(200).json({ received: true, duplicate: !inserted });
}