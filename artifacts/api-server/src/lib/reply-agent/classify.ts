import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  emailSendsTable,
  inboundMessagesTable,
  leadsTable,
  productsTable,
  replyAnalysesTable,
} from "@workspace/db/schema";
import { runJson } from "../ai";
import { writeReplyAudit } from "./helpers";

const CLASSIFICATIONS = [
  "INTERESTED",
  "SEND_INFORMATION",
  "BOOK_MEETING",
  "PRICING_QUESTION",
  "PRODUCT_QUESTION",
  "OBJECTION",
  "NOT_NOW",
  "NOT_INTERESTED",
  "WRONG_PERSON",
  "REFERRAL",
  "UNSUBSCRIBE",
  "OUT_OF_OFFICE",
  "AUTOMATED_REPLY",
  "COMPLAINT",
  "EXISTING_CUSTOMER",
  "UNKNOWN",
] as const;

export type Classification = (typeof CLASSIFICATIONS)[number];

export async function classifyInboundMessage(inboundId: number) {
  const [msg] = await db.select().from(inboundMessagesTable).where(eq(inboundMessagesTable.id, inboundId)).limit(1);
  if (!msg) throw new Error("Inbound message not found");

  const [lead] = msg.leadId
    ? await db.select().from(leadsTable).where(eq(leadsTable.id, msg.leadId)).limit(1)
    : [null];
  const [product] = msg.productId
    ? await db.select().from(productsTable).where(eq(productsTable.id, msg.productId)).limit(1)
    : [null];
  const [outbound] = msg.outboundSendId
    ? await db.select().from(emailSendsTable).where(eq(emailSendsTable.id, msg.outboundSendId)).limit(1)
    : [null];

  const system = `You are analysing inbound B2B sales replies. Classify the prospect's actual intent rather than individual words. Do not infer buying intent that is unsupported. Return ONLY valid JSON with keys:
classification (one of: ${CLASSIFICATIONS.join(", ")}),
confidence (0-100 integer),
sentiment (positive|neutral|negative|mixed),
buying_intent (high|medium|low|none),
summary (string),
objection_type (string|null),
requested_action (string|null),
recommended_action (string),
requires_response (boolean),
requires_human_approval (boolean),
follow_up_days (integer|null),
return_date (ISO date string|null for OOO).
Distinguish "I am interested" from "I'm not interested". Prefer UNKNOWN when unsure.`;

  const user = `Product: ${product?.name ?? "Unknown"}
Product ICP notes: ${(product?.icp ?? "").slice(0, 800)}
Prospect: ${lead ? `${lead.firstName} ${lead.lastName} <${lead.email}>` : msg.sender}
Title: ${lead?.title ?? "n/a"}
Company: ${lead?.company ?? "n/a"}

Original outbound subject: ${outbound?.subject ?? "n/a"}
Original outbound body (truncated): ${(outbound?.body ?? "").replace(/<[^>]+>/g, " ").slice(0, 1500)}

Inbound subject: ${msg.subject ?? ""}
Inbound body:
${(msg.bodyText || msg.bodyHtml || "").replace(/<[^>]+>/g, " ").slice(0, 4000)}`;

  let json: Record<string, unknown>;
  try {
    const result = await runJson(system, user);
    json = result.json as Record<string, unknown>;
  } catch (err) {
    await writeReplyAudit({
      productId: msg.productId,
      leadId: msg.leadId,
      inboundMessageId: inboundId,
      eventType: "classification_failed",
      payload: { error: String(err) },
    });
    const [failed] = await db
      .insert(replyAnalysesTable)
      .values({
        inboundMessageId: inboundId,
        classification: "UNKNOWN",
        confidence: 0,
        sentiment: "neutral",
        buyingIntent: "none",
        summary: "AI processing failed – manual review required.",
        recommendedAction: "Manual review required",
        requiresResponse: true,
        requiresApproval: true,
        rawAiJson: { error: String(err) },
      })
      .onConflictDoNothing()
      .returning();
    return failed ?? (await db.select().from(replyAnalysesTable).where(eq(replyAnalysesTable.inboundMessageId, inboundId)).then((r) => r[0]));
  }

  let classification = String(json.classification ?? "UNKNOWN").toUpperCase();
  if (!CLASSIFICATIONS.includes(classification as Classification)) classification = "UNKNOWN";
  const confidence = Math.max(0, Math.min(100, Number(json.confidence) || 0));

  const values = {
    inboundMessageId: inboundId,
    classification,
    confidence,
    sentiment: json.sentiment ? String(json.sentiment) : null,
    buyingIntent: json.buying_intent ? String(json.buying_intent) : null,
    summary: json.summary ? String(json.summary).slice(0, 2000) : null,
    objectionType: json.objection_type ? String(json.objection_type) : null,
    requestedAction: json.requested_action ? String(json.requested_action) : null,
    recommendedAction: json.recommended_action ? String(json.recommended_action).slice(0, 2000) : null,
    requiresResponse: Boolean(json.requires_response ?? true),
    requiresApproval: Boolean(json.requires_human_approval ?? true),
    followUpDays: typeof json.follow_up_days === "number" ? json.follow_up_days : null,
    returnDate: json.return_date ? String(json.return_date) : null,
    rawAiJson: json,
  };

  const [existing] = await db
    .select({ id: replyAnalysesTable.id })
    .from(replyAnalysesTable)
    .where(eq(replyAnalysesTable.inboundMessageId, inboundId))
    .limit(1);

  const [row] = existing
    ? await db.update(replyAnalysesTable).set(values).where(eq(replyAnalysesTable.id, existing.id)).returning()
    : await db.insert(replyAnalysesTable).values(values).returning();

  await writeReplyAudit({
    productId: msg.productId,
    leadId: msg.leadId,
    inboundMessageId: inboundId,
    eventType: "classified",
    payload: { classification, confidence },
  });

  return row;
}
