/**
 * Opportunity / Deal Agent API.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  opportunityActionsTable,
  opportunityContactsTable,
  opportunityObjectionsTable,
  opportunityQualificationTable,
  pipelineDealsTable,
  productOpportunitySettingsTable,
  PIPELINE_STAGES,
} from "@workspace/db/schema";
import { canAccessProduct } from "../lib/productAccess";
import { toJson } from "../lib/serialize";
import {
  changeDealStage,
  createOpportunity,
  getDealIntelligenceBundle,
  getOrCreateOppSettings,
  refreshAllActiveDeals,
  refreshDealEngines,
  writeOppAudit,
} from "../lib/opportunity-agent/service";
import { generateDealAiSummary } from "../lib/opportunity-agent/aiSummary";

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

const stages = PIPELINE_STAGES as unknown as [string, ...string[]];

// Analytics
router.get("/products/:productId/opportunities/metrics", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const deals = await db.select().from(pipelineDealsTable).where(eq(pipelineDealsTable.productId, productId));
  const active = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let pipelineValue = 0;
  let weighted = 0;
  let atRisk = 0;
  let expectedThisMonth = 0;
  let wonThisMonth = 0;
  let lostThisMonth = 0;

  for (const d of deals) {
    const arr = parseFloat(d.arr ?? d.value ?? "0") || 0;
    if (d.stage !== "won" && d.stage !== "lost") {
      pipelineValue += arr;
      weighted += arr * ((d.probability ?? 0) / 100);
      if (d.health === "at_risk" || d.health === "stalled") atRisk++;
      if (d.expectedCloseDate) {
        const close = new Date(d.expectedCloseDate);
        if (close >= monthStart && close.getMonth() === now.getMonth()) expectedThisMonth += arr * ((d.probability ?? 0) / 100);
      }
    }
    if (d.stage === "won" && d.wonAt && new Date(d.wonAt) >= monthStart) wonThisMonth += arr;
    if (d.stage === "lost" && d.lostAt && new Date(d.lostAt) >= monthStart) lostThisMonth += arr;
  }

  res.json({
    pipelineValue: Math.round(pipelineValue),
    weightedPipeline: Math.round(weighted),
    opportunities: active.length,
    highProbability: active.filter((d) => (d.probability ?? 0) >= 70).length,
    atRisk,
    expectedThisMonth: Math.round(expectedThisMonth),
    wonThisMonth: Math.round(wonThisMonth),
    lostThisMonth: Math.round(lostThisMonth),
  });
});

// My Actions
router.get("/products/:productId/opportunities/actions", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const status = typeof req.query.status === "string" ? req.query.status : "pending";
  const rows = await db
    .select({
      action: opportunityActionsTable,
      deal: pipelineDealsTable,
    })
    .from(opportunityActionsTable)
    .innerJoin(pipelineDealsTable, eq(pipelineDealsTable.id, opportunityActionsTable.dealId))
    .where(and(
      eq(opportunityActionsTable.productId, productId),
      eq(opportunityActionsTable.status, status),
    ))
    .orderBy(asc(opportunityActionsTable.dueAt), desc(opportunityActionsTable.priority));

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endToday = new Date(startToday);
  endToday.setDate(endToday.getDate() + 1);
  const endWeek = new Date(startToday);
  endWeek.setDate(endWeek.getDate() + 7);

  const items = rows.map((r) => {
    const action = toJson(r.action) as {
      id: number
      dueAt?: string | Date | null
      description?: string
      actionType?: string
      priority?: number | null
    };
    return {
      ...action,
      dueAt: action.dueAt ?? null,
      deal: {
        id: r.deal.id,
        contactName: r.deal.contactName,
        companyName: r.deal.companyName,
        stage: r.deal.stage,
        health: r.deal.health,
        probability: r.deal.probability,
        arr: r.deal.arr,
      },
    };
  });

  res.json({
    items,
    buckets: {
      overdue: items.filter((i) => i.dueAt && new Date(i.dueAt as string) < startToday).length,
      today: items.filter((i) => {
        if (!i.dueAt) return false;
        const d = new Date(i.dueAt as string);
        return d >= startToday && d < endToday;
      }).length,
      thisWeek: items.filter((i) => {
        if (!i.dueAt) return false;
        const d = new Date(i.dueAt as string);
        return d >= endToday && d < endWeek;
      }).length,
    },
  });
});

router.post("/products/:productId/opportunities/actions/:actionId/complete", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  const actionId = parseId(req.params.actionId);
  if (!productId || !actionId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [row] = await db
    .update(opportunityActionsTable)
    .set({ status: "done", completedAt: new Date() })
    .where(and(eq(opportunityActionsTable.id, actionId), eq(opportunityActionsTable.productId, productId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await refreshDealEngines(row.dealId);
  res.json({ action: toJson(row) });
});

// Convert lead → opportunity
router.post("/products/:productId/opportunities/convert", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const leadId = Number(req.body?.leadId);
  if (!Number.isInteger(leadId) || leadId <= 0) { res.status(400).json({ error: "leadId required" }); return; }

  try {
    const result = await createOpportunity({
      productId,
      leadId,
      source: "manual_convert",
      ownerUserId: req.user!.id,
      notes: typeof req.body?.notes === "string" ? req.body.notes : null,
    });
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// Deal intelligence detail
router.get("/products/:productId/opportunities/:dealId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  const dealId = parseId(req.params.dealId);
  if (!productId || !dealId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const bundle = await getDealIntelligenceBundle(dealId);
  if (!bundle || bundle.deal.productId !== productId) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toJson(bundle));
});

router.post("/products/:productId/opportunities/:dealId/ai-summary", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  const dealId = parseId(req.params.dealId);
  if (!productId || !dealId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const row = await generateDealAiSummary(dealId);
    res.json({ intelligence: toJson(row) });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

router.post("/products/:productId/opportunities/:dealId/stage", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  const dealId = parseId(req.params.dealId);
  if (!productId || !dealId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const stage = String(req.body?.stage ?? "");
  if (!stages.includes(stage)) { res.status(400).json({ error: "Invalid stage" }); return; }
  if (stage === "lost" && !req.body?.lostReason) {
    res.status(400).json({ error: "lostReason required when marking lost" });
    return;
  }

  try {
    const deal = await changeDealStage({
      dealId,
      toStage: stage,
      source: "user",
      reason: typeof req.body?.reason === "string" ? req.body.reason : undefined,
      lostReason: typeof req.body?.lostReason === "string" ? req.body.lostReason : null,
    });
    res.json({ deal: toJson(deal) });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// Qualification update
router.put("/products/:productId/opportunities/:dealId/qualification", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  const dealId = parseId(req.params.dealId);
  if (!productId || !dealId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [deal] = await db.select().from(pipelineDealsTable).where(and(eq(pipelineDealsTable.id, dealId), eq(pipelineDealsTable.productId, productId))).limit(1);
  if (!deal) { res.status(404).json({ error: "Not found" }); return; }

  const fields = [
    "problemStatus",
    "fitStatus",
    "authorityStatus",
    "commercialsStatus",
    "timingStatus",
    "nextStepStatus",
  ] as const;
  const set: Record<string, string> = {};
  for (const f of fields) {
    if (typeof req.body?.[f] === "string") set[f] = req.body[f];
  }
  const [existing] = await db.select().from(opportunityQualificationTable).where(eq(opportunityQualificationTable.dealId, dealId)).limit(1);
  const [row] = existing
    ? await db.update(opportunityQualificationTable).set(set).where(eq(opportunityQualificationTable.id, existing.id)).returning()
    : await db.insert(opportunityQualificationTable).values({ dealId, ...set }).returning();

  await refreshDealEngines(dealId);
  res.json({ qualification: toJson(row) });
});

router.post("/products/:productId/opportunities/:dealId/contacts", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  const dealId = parseId(req.params.dealId);
  if (!productId || !dealId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [row] = await db.insert(opportunityContactsTable).values({
    dealId,
    leadId: typeof req.body?.leadId === "number" ? req.body.leadId : null,
    name: String(req.body?.name ?? ""),
    stakeholderRole: typeof req.body?.stakeholderRole === "string" ? req.body.stakeholderRole : null,
    influence: typeof req.body?.influence === "string" ? req.body.influence : null,
    primaryContact: Boolean(req.body?.primaryContact),
  }).returning();
  await refreshDealEngines(dealId);
  res.status(201).json({ contact: toJson(row) });
});

router.post("/products/:productId/opportunities/:dealId/objections", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  const dealId = parseId(req.params.dealId);
  if (!productId || !dealId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [row] = await db.insert(opportunityObjectionsTable).values({
    dealId,
    objectionType: typeof req.body?.objectionType === "string" ? req.body.objectionType : "other",
    description: String(req.body?.description ?? ""),
    evidence: typeof req.body?.evidence === "string" ? req.body.evidence : null,
    status: "open",
  }).returning();
  await refreshDealEngines(dealId);
  res.status(201).json({ objection: toJson(row) });
});

router.post("/products/:productId/opportunities/:dealId/pain", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  const dealId = parseId(req.params.dealId);
  if (!productId || !dealId) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const { opportunityIntelligenceTable } = await import("@workspace/db/schema");
  const severity = req.body?.confirmed ? "confirmed" : "hypothesis";
  const primaryPain = typeof req.body?.primaryPain === "string" ? req.body.primaryPain : null;
  const [existing] = await db.select().from(opportunityIntelligenceTable).where(eq(opportunityIntelligenceTable.dealId, dealId)).limit(1);
  const [row] = existing
    ? await db.update(opportunityIntelligenceTable).set({ primaryPain, painSeverity: severity }).where(eq(opportunityIntelligenceTable.id, existing.id)).returning()
    : await db.insert(opportunityIntelligenceTable).values({ dealId, primaryPain, painSeverity: severity }).returning();
  res.json({ intelligence: toJson(row) });
});

// Settings
router.get("/products/:productId/opportunity-settings", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json({ settings: await getOrCreateOppSettings(productId) });
});

router.put("/products/:productId/opportunity-settings", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const schema = z.object({
    autoCreateEnabled: z.boolean().optional(),
    triggerBookMeeting: z.boolean().optional(),
    triggerInterested: z.boolean().optional(),
    triggerPricing: z.boolean().optional(),
    requireNonRejectTier: z.boolean().optional(),
    autoStageMove: z.boolean().optional(),
    minStageConfidence: z.number().int().min(50).max(100).optional(),
    stallDays: z.number().int().min(1).max(90).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid settings" }); return; }

  const existing = await getOrCreateOppSettings(productId);
  const [row] = await db
    .update(productOpportunitySettingsTable)
    .set(parsed.data)
    .where(eq(productOpportunitySettingsTable.id, existing.id))
    .returning();
  await writeOppAudit({ productId, eventType: "settings_updated", payload: parsed.data });
  res.json({ settings: row });
});

router.post("/products/:productId/opportunities/refresh", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json(await refreshAllActiveDeals(100));
});

export { stages as OPPORTUNITY_STAGES };
export default router;
