/**
 * AI Inbox / Reply Agent API — list, detail, drafts, settings, knowledge, metrics.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  aiReplyDraftsTable,
  followUpsTable,
  inboundMessagesTable,
  leadsTable,
  productAiReplySettingsTable,
  productReplyKnowledgeTable,
  replyAgentAuditTable,
  replyAnalysesTable,
} from "@workspace/db/schema";
import { canAccessProduct } from "../lib/productAccess";
import { processInboundMessage, processDueFollowUps, sendApprovedDraft } from "../lib/reply-agent/processor";
import { generateReplyDraft } from "../lib/reply-agent/draft";
import { getOrCreateReplySettings, writeReplyAudit } from "../lib/reply-agent/helpers";

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

const settingsSchema = z.object({
  autoProcessReplies: z.boolean().optional(),
  autoPauseOnReply: z.boolean().optional(),
  autoSendHighConfidence: z.boolean().optional(),
  autoHandleOoo: z.boolean().optional(),
  autoHandleUnsubscribe: z.boolean().optional(),
  autoHandleNotInterested: z.boolean().optional(),
  autoAnswerProductQuestions: z.boolean().optional(),
  autoAnswerPricing: z.boolean().optional(),
  autoSendMeetingLink: z.boolean().optional(),
  minConfidenceAutoSend: z.number().int().min(50).max(100).optional(),
  minConfidenceDraft: z.number().int().min(0).max(100).optional(),
  defaultNotNowDays: z.number().int().min(1).max(365).optional(),
  defaultOooFollowUpDays: z.number().int().min(0).max(60).optional(),
  bookingLink: z.string().url().nullable().optional().or(z.literal("")),
});

const knowledgeSchema = z.object({
  category: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  url: z.string().url().nullable().optional().or(z.literal("")),
  active: z.boolean().optional(),
});

// GET /api/products/:productId/ai-inbox
router.get("/products/:productId/ai-inbox", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const tab = typeof req.query.tab === "string" ? req.query.tab : "needs_attention";
  const conditions = [eq(inboundMessagesTable.productId, productId)];
  if (tab && tab !== "all") {
    conditions.push(eq(inboundMessagesTable.inboxBucket, tab));
  }

  const rows = await db
    .select({
      message: inboundMessagesTable,
      analysis: replyAnalysesTable,
      lead: leadsTable,
      draft: aiReplyDraftsTable,
    })
    .from(inboundMessagesTable)
    .leftJoin(replyAnalysesTable, eq(replyAnalysesTable.inboundMessageId, inboundMessagesTable.id))
    .leftJoin(leadsTable, eq(leadsTable.id, inboundMessagesTable.leadId))
    .leftJoin(aiReplyDraftsTable, eq(aiReplyDraftsTable.inboundMessageId, inboundMessagesTable.id))
    .where(and(...conditions))
    .orderBy(desc(inboundMessagesTable.receivedAt))
    .limit(200);

  // Dedupe drafts (multiple per message) — keep latest
  const byId = new Map<number, (typeof rows)[0]>();
  for (const row of rows) {
    const prev = byId.get(row.message.id);
    if (!prev) {
      byId.set(row.message.id, row);
      continue;
    }
    if ((row.draft?.id ?? 0) > (prev.draft?.id ?? 0)) byId.set(row.message.id, row);
  }

  const items = [...byId.values()].map((r) => ({
    id: r.message.id,
    subject: r.message.subject,
    sender: r.message.sender,
    snippet: (r.message.bodyText || "").slice(0, 160),
    receivedAt: r.message.receivedAt,
    processingStatus: r.message.processingStatus,
    inboxBucket: r.message.inboxBucket,
    matchMethod: r.message.matchMethod,
    lead: r.lead
      ? { id: r.lead.id, firstName: r.lead.firstName, lastName: r.lead.lastName, company: r.lead.company, email: r.lead.email }
      : null,
    classification: r.analysis?.classification ?? null,
    confidence: r.analysis?.confidence ?? null,
    summary: r.analysis?.summary ?? null,
    recommendedAction: r.analysis?.recommendedAction ?? null,
    buyingIntent: r.analysis?.buyingIntent ?? null,
    draft: r.draft
      ? { id: r.draft.id, status: r.draft.status, body: r.draft.body, subject: r.draft.subject }
      : null,
  }));

  const countsRows = await db
    .select({
      bucket: inboundMessagesTable.inboxBucket,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(inboundMessagesTable)
    .where(eq(inboundMessagesTable.productId, productId))
    .groupBy(inboundMessagesTable.inboxBucket);

  const counts: Record<string, number> = {};
  for (const c of countsRows) counts[c.bucket] = Number(c.count);

  res.json({ items, counts });
});

// Metrics — must be before :inboundId
router.get("/products/:productId/ai-inbox/metrics", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const sinceDays = Number(req.query.days) || 30;
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  const [totals] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(inboundMessagesTable)
    .where(and(eq(inboundMessagesTable.productId, productId), gte(inboundMessagesTable.receivedAt, since)));

  const byClass = await db
    .select({
      classification: replyAnalysesTable.classification,
      count: sql<number>`cast(count(*) as int)`,
      avgConfidence: sql<number>`cast(avg(${replyAnalysesTable.confidence}) as int)`,
    })
    .from(replyAnalysesTable)
    .innerJoin(inboundMessagesTable, eq(inboundMessagesTable.id, replyAnalysesTable.inboundMessageId))
    .where(and(eq(inboundMessagesTable.productId, productId), gte(inboundMessagesTable.receivedAt, since)))
    .groupBy(replyAnalysesTable.classification);

  const [handled] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(inboundMessagesTable)
    .where(and(
      eq(inboundMessagesTable.productId, productId),
      eq(inboundMessagesTable.inboxBucket, "ai_handled"),
      gte(inboundMessagesTable.receivedAt, since),
    ));

  const [needs] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(inboundMessagesTable)
    .where(and(
      eq(inboundMessagesTable.productId, productId),
      eq(inboundMessagesTable.inboxBucket, "needs_attention"),
      gte(inboundMessagesTable.receivedAt, since),
    ));

  res.json({
    repliesReceived: Number(totals?.count ?? 0),
    aiHandled: Number(handled?.count ?? 0),
    needsAttention: Number(needs?.count ?? 0),
    byClassification: byClass,
  });
});

// Manual follow-up sweep (also cron)
router.post("/products/:productId/ai-inbox/process-follow-ups", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json(await processDueFollowUps());
});

// GET detail
router.get("/products/:productId/ai-inbox/:inboundId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  const inboundId = parseId(req.params.inboundId);
  if (!productId || !inboundId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [msg] = await db
    .select()
    .from(inboundMessagesTable)
    .where(and(eq(inboundMessagesTable.id, inboundId), eq(inboundMessagesTable.productId, productId)))
    .limit(1);
  if (!msg) { res.status(404).json({ error: "Not found" }); return; }

  const [analysis] = await db.select().from(replyAnalysesTable).where(eq(replyAnalysesTable.inboundMessageId, inboundId)).limit(1);
  const drafts = await db.select().from(aiReplyDraftsTable).where(eq(aiReplyDraftsTable.inboundMessageId, inboundId)).orderBy(desc(aiReplyDraftsTable.id));
  const [lead] = msg.leadId ? await db.select().from(leadsTable).where(eq(leadsTable.id, msg.leadId)).limit(1) : [null];
  const followUps = await db.select().from(followUpsTable).where(eq(followUpsTable.inboundMessageId, inboundId)).orderBy(asc(followUpsTable.scheduledAt));
  const audit = await db
    .select()
    .from(replyAgentAuditTable)
    .where(eq(replyAgentAuditTable.inboundMessageId, inboundId))
    .orderBy(desc(replyAgentAuditTable.createdAt))
    .limit(50);

  res.json({ message: msg, analysis: analysis ?? null, drafts, lead, followUps, audit });
});

// Reprocess
router.post("/products/:productId/ai-inbox/:inboundId/process", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  const inboundId = parseId(req.params.inboundId);
  if (!productId || !inboundId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }
  await processInboundMessage(inboundId);
  res.json({ ok: true });
});

// Generate / update draft
router.post("/products/:productId/ai-inbox/:inboundId/draft", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  const inboundId = parseId(req.params.inboundId);
  if (!productId || !inboundId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const draft = await generateReplyDraft(inboundId);
    res.json({ draft });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

router.patch("/products/:productId/ai-inbox/drafts/:draftId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  const draftId = parseId(req.params.draftId);
  if (!productId || !draftId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const body = typeof req.body?.body === "string" ? req.body.body : null;
  const subject = typeof req.body?.subject === "string" ? req.body.subject : undefined;
  if (!body) { res.status(400).json({ error: "body required" }); return; }

  const [draft] = await db.select().from(aiReplyDraftsTable).where(eq(aiReplyDraftsTable.id, draftId)).limit(1);
  if (!draft) { res.status(404).json({ error: "Draft not found" }); return; }
  const [msg] = await db.select().from(inboundMessagesTable).where(eq(inboundMessagesTable.id, draft.inboundMessageId)).limit(1);
  if (!msg || msg.productId !== productId) { res.status(404).json({ error: "Draft not found" }); return; }
  if (draft.status === "sent") { res.status(409).json({ error: "Already sent" }); return; }

  const [updated] = await db
    .update(aiReplyDraftsTable)
    .set({
      body,
      ...(subject !== undefined ? { subject } : {}),
      status: "awaiting_approval",
      editedByUser: req.user!.id,
    })
    .where(eq(aiReplyDraftsTable.id, draftId))
    .returning();

  res.json({ draft: updated });
});

router.post("/products/:productId/ai-inbox/drafts/:draftId/send", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  const draftId = parseId(req.params.draftId);
  if (!productId || !draftId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [draft] = await db.select().from(aiReplyDraftsTable).where(eq(aiReplyDraftsTable.id, draftId)).limit(1);
  if (!draft) { res.status(404).json({ error: "Draft not found" }); return; }
  const [msg] = await db.select().from(inboundMessagesTable).where(eq(inboundMessagesTable.id, draft.inboundMessageId)).limit(1);
  if (!msg || msg.productId !== productId) { res.status(404).json({ error: "Draft not found" }); return; }

  const ok = await sendApprovedDraft(draftId, req.user!.id);
  if (!ok) { res.status(502).json({ error: "Send failed" }); return; }
  res.json({ ok: true });
});

// Settings
router.get("/products/:productId/ai-reply-settings", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json({ settings: await getOrCreateReplySettings(productId) });
});

router.put("/products/:productId/ai-reply-settings", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid" }); return; }

  const existing = await getOrCreateReplySettings(productId);
  const bookingLink =
    parsed.data.bookingLink === "" || parsed.data.bookingLink === undefined
      ? parsed.data.bookingLink === ""
        ? null
        : existing.bookingLink
      : parsed.data.bookingLink;

  const [row] = await db
    .update(productAiReplySettingsTable)
    .set({
      ...parsed.data,
      bookingLink,
    })
    .where(eq(productAiReplySettingsTable.id, existing.id))
    .returning();

  await writeReplyAudit({ productId, eventType: "settings_updated", payload: parsed.data });
  res.json({ settings: row });
});

// Knowledge CRUD
router.get("/products/:productId/reply-knowledge", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const items = await db
    .select()
    .from(productReplyKnowledgeTable)
    .where(eq(productReplyKnowledgeTable.productId, productId))
    .orderBy(desc(productReplyKnowledgeTable.updatedAt));
  res.json({ items });
});

router.post("/products/:productId/reply-knowledge", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const parsed = knowledgeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid" }); return; }
  const [row] = await db
    .insert(productReplyKnowledgeTable)
    .values({
      productId,
      category: parsed.data.category,
      title: parsed.data.title,
      content: parsed.data.content,
      url: parsed.data.url || null,
      active: parsed.data.active ?? true,
    })
    .returning();
  res.status(201).json({ item: row });
});

router.put("/products/:productId/reply-knowledge/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  const id = parseId(req.params.id);
  if (!productId || !id) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const parsed = knowledgeSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid" }); return; }
  const [row] = await db
    .update(productReplyKnowledgeTable)
    .set({
      ...parsed.data,
      url: parsed.data.url === "" ? null : parsed.data.url,
    })
    .where(and(eq(productReplyKnowledgeTable.id, id), eq(productReplyKnowledgeTable.productId, productId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ item: row });
});

router.delete("/products/:productId/reply-knowledge/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  const id = parseId(req.params.id);
  if (!productId || !id) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db
    .delete(productReplyKnowledgeTable)
    .where(and(eq(productReplyKnowledgeTable.id, id), eq(productReplyKnowledgeTable.productId, productId)));
  res.json({ ok: true });
});

export default router;
