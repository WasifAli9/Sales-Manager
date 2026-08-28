import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  aiReplyDraftsTable,
  inboundMessagesTable,
  leadsTable,
  productReplyKnowledgeTable,
  productsTable,
  replyAnalysesTable,
} from "@workspace/db/schema";
import { runJson } from "../ai";
import { getOrCreateReplySettings, writeReplyAudit } from "./helpers";

export async function generateReplyDraft(inboundId: number) {
  const [msg] = await db.select().from(inboundMessagesTable).where(eq(inboundMessagesTable.id, inboundId)).limit(1);
  if (!msg) throw new Error("Inbound not found");
  const [analysis] = await db
    .select()
    .from(replyAnalysesTable)
    .where(eq(replyAnalysesTable.inboundMessageId, inboundId))
    .limit(1);
  if (!analysis) throw new Error("Analysis required before drafting");

  const [existingSent] = await db
    .select()
    .from(aiReplyDraftsTable)
    .where(and(eq(aiReplyDraftsTable.inboundMessageId, inboundId), eq(aiReplyDraftsTable.status, "sent")))
    .limit(1);
  if (existingSent) return existingSent;

  const [lead] = msg.leadId
    ? await db.select().from(leadsTable).where(eq(leadsTable.id, msg.leadId)).limit(1)
    : [null];
  const [product] = msg.productId
    ? await db.select().from(productsTable).where(eq(productsTable.id, msg.productId)).limit(1)
    : [null];
  const settings = msg.productId ? await getOrCreateReplySettings(msg.productId) : null;

  const knowledge = msg.productId
    ? await db
        .select()
        .from(productReplyKnowledgeTable)
        .where(and(eq(productReplyKnowledgeTable.productId, msg.productId), eq(productReplyKnowledgeTable.active, true)))
    : [];

  const knowledgeBlock = knowledge
    .map((k) => `[${k.category}] ${k.title}: ${k.content}${k.url ? ` (URL: ${k.url})` : ""}`)
    .join("\n");

  const system = `You draft short, professional B2B sales email replies.
Rules:
- Use ONLY facts from the approved knowledge block and product context.
- Never invent pricing, URLs, features, case studies, or discounts.
- If information is missing, say you will confirm with the team — do not guess.
- Keep under 180 words. Plain text only (no HTML). No em dashes.
Return JSON: { "subject": string, "body": string, "missing_knowledge": boolean }`;

  const user = `Product: ${product?.name ?? "our product"}
Booking link (only if BOOK_MEETING and provided): ${settings?.bookingLink ?? "(none)"}
Classification: ${analysis.classification}
Summary: ${analysis.summary}
Recommended action: ${analysis.recommendedAction}
Prospect first name: ${lead?.firstName || "there"}

Approved knowledge:
${knowledgeBlock || "(none — escalate if facts are required)"}

Prospect message:
${(msg.bodyText || "").slice(0, 2500)}`;

  let subject = `Re: ${msg.subject?.replace(/^Re:\s*/i, "") || "your message"}`;
  let body = `Hi ${lead?.firstName || "there"},\n\nThanks for your reply — I'll follow up shortly with the right details.\n\nBest regards`;
  let missingKnowledge = !knowledgeBlock && ["PRODUCT_QUESTION", "PRICING_QUESTION", "SEND_INFORMATION"].includes(analysis.classification);

  try {
    const { json } = await runJson(system, user);
    const data = json as Record<string, unknown>;
    if (data.subject) subject = String(data.subject).slice(0, 200);
    if (data.body) body = String(data.body).slice(0, 5000);
    if (typeof data.missing_knowledge === "boolean") missingKnowledge = data.missing_knowledge;
  } catch {
    // keep fallback draft
  }

  if (analysis.classification === "BOOK_MEETING" && settings?.bookingLink) {
    if (!body.includes(settings.bookingLink)) {
      body += `\n\nYou can book a time here: ${settings.bookingLink}`;
    }
  }

  const status = missingKnowledge || analysis.requiresApproval ? "awaiting_approval" : "awaiting_approval";

  const [draft] = await db
    .insert(aiReplyDraftsTable)
    .values({
      inboundMessageId: inboundId,
      body,
      subject,
      status,
    })
    .returning();

  await writeReplyAudit({
    productId: msg.productId,
    leadId: msg.leadId,
    inboundMessageId: inboundId,
    eventType: "draft_generated",
    payload: { draftId: draft.id, missingKnowledge },
  });

  return draft;
}
