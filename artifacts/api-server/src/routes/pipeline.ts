import { Router } from "express";
import { eq, and, lte, isNotNull, asc } from "drizzle-orm";
import { z } from "zod/v4";
import { db, pipelineDealsTable, productsTable, dealActivitiesTable, PIPELINE_STAGES } from "@workspace/db";
import { toJson } from "../lib/serialize";
import { changeDealStage, computeMrrArr, refreshDealEngines } from "../lib/opportunity-agent/service";

const router = Router();

const VALID_STAGES = PIPELINE_STAGES;
const VALID_ACTIVITY_KINDS = ["note", "call", "email", "meeting", "demo", "reply", "stage_change", "system"] as const;

router.get("/pipeline/reviews-due", async (req, res): Promise<void> => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      id: pipelineDealsTable.id,
      contactName: pipelineDealsTable.contactName,
      companyName: pipelineDealsTable.companyName,
      stage: pipelineDealsTable.stage,
      value: pipelineDealsTable.value,
      currency: pipelineDealsTable.currency,
      nextReviewDate: pipelineDealsTable.nextReviewDate,
      productId: pipelineDealsTable.productId,
      productName: productsTable.name,
      health: pipelineDealsTable.health,
      probability: pipelineDealsTable.probability,
    })
    .from(pipelineDealsTable)
    .innerJoin(productsTable, eq(pipelineDealsTable.productId, productsTable.id))
    .where(
      and(
        isNotNull(pipelineDealsTable.nextReviewDate),
        lte(pipelineDealsTable.nextReviewDate, date),
      ),
    )
    .orderBy(asc(pipelineDealsTable.nextReviewDate));

  res.json(rows.map(toJson));
});

router.get("/pipeline", async (req, res): Promise<void> => {
  const productId = parseInt(req.query.productId as string, 10);
  if (isNaN(productId)) { res.status(400).json({ error: "productId required" }); return; }

  const deals = await db
    .select()
    .from(pipelineDealsTable)
    .where(eq(pipelineDealsTable.productId, productId))
    .orderBy(pipelineDealsTable.createdAt);

  res.json(deals.map(toJson));
});

const CreateBody = z.object({
  productId: z.int(),
  contactName: z.string().min(1),
  companyName: z.string().nullish(),
  leadId: z.int().nullish(),
  value: z.number().min(0).optional().default(0),
  stage: z.enum(VALID_STAGES as unknown as [string, ...string[]]).optional().default("interested"),
  probability: z.int().min(0).max(100).optional(),
  currency: z.enum(["USD", "GBP", "AED"]).optional().default("USD"),
  frequency: z.enum(["monthly", "annual"]).optional().default("monthly"),
  expectedCloseDate: z.string().nullish(),
  notes: z.string().nullish(),
  nextReviewDate: z.string().nullish(),
});

router.post("/pipeline", async (req, res): Promise<void> => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const d = parsed.data;
  const { mrr, arr } = computeMrrArr(d.value, d.frequency ?? "monthly");
  const stage = d.stage ?? "interested";

  const [row] = await db.insert(pipelineDealsTable).values({
    productId: d.productId,
    leadId: d.leadId ?? null,
    contactName: d.contactName,
    companyName: d.companyName ?? null,
    value: String(d.value),
    mrr,
    arr,
    stage,
    probability: d.probability ?? (stage === "interested" ? 15 : 50),
    health: "healthy",
    source: "manual",
    currency: d.currency ?? "USD",
    frequency: d.frequency ?? "monthly",
    expectedCloseDate: d.expectedCloseDate ?? null,
    notes: d.notes ?? null,
    nextReviewDate: d.nextReviewDate ?? null,
    lastEngagementAt: new Date(),
  }).returning();

  await refreshDealEngines(row.id);
  const [fresh] = await db.select().from(pipelineDealsTable).where(eq(pipelineDealsTable.id, row.id)).limit(1);
  res.status(201).json(toJson(fresh ?? row));
});

const UpdateBody = z.object({
  contactName: z.string().min(1).optional(),
  companyName: z.string().nullish(),
  value: z.number().min(0).optional(),
  stage: z.enum(VALID_STAGES as unknown as [string, ...string[]]).optional(),
  probability: z.int().min(0).max(100).optional(),
  currency: z.enum(["USD", "GBP", "AED"]).optional(),
  frequency: z.enum(["monthly", "annual"]).optional(),
  expectedCloseDate: z.string().nullish(),
  notes: z.string().nullish(),
  nextReviewDate: z.string().nullish(),
  lostReason: z.string().nullish(),
});

router.patch("/pipeline/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const d = parsed.data;

  if (d.stage !== undefined) {
    try {
      const deal = await changeDealStage({
        dealId: id,
        toStage: d.stage,
        source: "user",
        lostReason: d.lostReason ?? null,
      });
      // Apply other field updates after stage change
      const set: Record<string, unknown> = {};
      if (d.contactName !== undefined) set.contactName = d.contactName;
      if ("companyName" in d) set.companyName = d.companyName ?? null;
      if (d.value !== undefined) {
        set.value = String(d.value);
        const freq = d.frequency ?? deal.frequency ?? "monthly";
        const { mrr, arr } = computeMrrArr(d.value, freq);
        set.mrr = mrr;
        set.arr = arr;
      }
      if (d.probability !== undefined) set.probability = d.probability;
      if (d.currency !== undefined) set.currency = d.currency;
      if (d.frequency !== undefined) {
        set.frequency = d.frequency;
        const val = d.value ?? parseFloat(deal.value ?? "0");
        const { mrr, arr } = computeMrrArr(val, d.frequency);
        set.mrr = mrr;
        set.arr = arr;
      }
      if ("expectedCloseDate" in d) set.expectedCloseDate = d.expectedCloseDate ?? null;
      if ("notes" in d) set.notes = d.notes ?? null;
      if ("nextReviewDate" in d) set.nextReviewDate = d.nextReviewDate ?? null;
      if (Object.keys(set).length) {
        const [row] = await db.update(pipelineDealsTable).set(set).where(eq(pipelineDealsTable.id, id)).returning();
        res.json(toJson(row));
        return;
      }
      res.json(toJson(deal));
      return;
    } catch (err) {
      res.status(400).json({ error: String(err) });
      return;
    }
  }

  const [current] = await db.select().from(pipelineDealsTable).where(eq(pipelineDealsTable.id, id)).limit(1);
  if (!current) { res.status(404).json({ error: "Not found" }); return; }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (d.contactName !== undefined) set.contactName = d.contactName;
  if ("companyName" in d) set.companyName = d.companyName ?? null;
  if (d.value !== undefined) {
    set.value = String(d.value);
    const freq = d.frequency ?? current.frequency;
    const { mrr, arr } = computeMrrArr(d.value, freq);
    set.mrr = mrr;
    set.arr = arr;
  }
  if (d.probability !== undefined) set.probability = d.probability;
  if (d.currency !== undefined) set.currency = d.currency;
  if (d.frequency !== undefined) {
    set.frequency = d.frequency;
    const val = d.value ?? parseFloat(current.value ?? "0");
    const { mrr, arr } = computeMrrArr(val, d.frequency);
    set.mrr = mrr;
    set.arr = arr;
  }
  if ("expectedCloseDate" in d) set.expectedCloseDate = d.expectedCloseDate ?? null;
  if ("notes" in d) set.notes = d.notes ?? null;
  if ("nextReviewDate" in d) set.nextReviewDate = d.nextReviewDate ?? null;

  const [row] = await db.update(pipelineDealsTable).set(set).where(eq(pipelineDealsTable.id, id)).returning();
  await refreshDealEngines(id);
  res.json(toJson(row));
});

router.delete("/pipeline/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(dealActivitiesTable).where(eq(dealActivitiesTable.dealId, id));
  await db.delete(pipelineDealsTable).where(eq(pipelineDealsTable.id, id));
  res.status(204).send();
});

router.get("/pipeline/:id/activities", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const activities = await db
    .select()
    .from(dealActivitiesTable)
    .where(eq(dealActivitiesTable.dealId, id))
    .orderBy(asc(dealActivitiesTable.createdAt));

  res.json(activities.map(toJson));
});

const CreateActivityBody = z.object({
  kind: z.enum(VALID_ACTIVITY_KINDS).optional().default("note"),
  content: z.string().min(1),
  nextReviewDate: z.string().nullish(),
});

router.post("/pipeline/:id/activities", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [deal] = await db.select({ id: pipelineDealsTable.id })
    .from(pipelineDealsTable)
    .where(eq(pipelineDealsTable.id, id));
  if (!deal) { res.status(404).json({ error: "Deal not found" }); return; }

  const parsed = CreateActivityBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return; }
  const d = parsed.data;

  const [activity] = await db.insert(dealActivitiesTable).values({
    dealId: id,
    kind: d.kind,
    content: d.content,
  }).returning();

  await db.update(pipelineDealsTable)
    .set({
      lastEngagementAt: new Date(),
      ...(d.nextReviewDate ? { nextReviewDate: d.nextReviewDate } : {}),
      updatedAt: new Date(),
    })
    .where(eq(pipelineDealsTable.id, id));

  await refreshDealEngines(id);
  res.status(201).json(toJson(activity));
});

export default router;
