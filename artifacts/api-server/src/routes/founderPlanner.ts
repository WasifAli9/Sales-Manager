/**
 * Founder Daily Planner / My Day API (cross-product).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  agentEventsTable,
  plannerAuditTable,
  plannerPreferencesTable,
  productAssignmentsTable,
  productsTable,
} from "@workspace/db/schema";
import { canAccessProduct } from "../lib/productAccess";
import { toJson } from "../lib/serialize";
import {
  completePlannerItem,
  delegatePlannerItem,
  getEndOfDayReview,
  getMyDay,
  getOrCreatePrefs,
  rebuildDailyPlan,
  snoozePlannerItem,
  writePlannerAudit,
} from "../lib/founder-planner/service";

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

async function accessibleProductIds(req: Request): Promise<number[] | "all"> {
  if (req.user!.role === "owner") return "all";
  const rows = await db
    .select({ productId: productAssignmentsTable.productId })
    .from(productAssignmentsTable)
    .where(eq(productAssignmentsTable.userId, req.user!.id));
  return rows.map((r) => r.productId);
}

/** List open agent events (All Businesses or product filter). */
router.get("/founder-planner/events", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = req.query.productId ? parseId(String(req.query.productId)) : null;
  if (productId && !(await canAccessProduct(req, productId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const access = await accessibleProductIds(req);
  const conditions = [eq(agentEventsTable.status, "open")];
  if (productId) conditions.push(eq(agentEventsTable.productId, productId));
  else if (access !== "all") {
    if (!access.length) {
      res.json({ items: [] });
      return;
    }
    conditions.push(inArray(agentEventsTable.productId, access));
  }

  const rows = await db
    .select({
      event: agentEventsTable,
      productName: productsTable.name,
    })
    .from(agentEventsTable)
    .leftJoin(productsTable, eq(productsTable.id, agentEventsTable.productId))
    .where(and(...conditions))
    .orderBy(desc(agentEventsTable.createdAt))
    .limit(100);

  res.json({
    items: rows.map((r) => toJson({ ...r.event, productName: r.productName })),
  });
});

/** Get today's My Day plan (builds if missing). */
router.get("/founder-planner/my-day", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = req.query.productId ? parseId(String(req.query.productId)) : null;
  if (productId && !(await canAccessProduct(req, productId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const day = await getMyDay(req.user!.id, productId);
    res.json(toJson(day));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load My Day" });
  }
});

/** Force rebuild today's plan (always cross-product; UI filters). */
router.post("/founder-planner/rebuild", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const body = z
    .object({
      availableMinutes: z.number().int().min(30).max(720).optional(),
      productId: z.number().int().positive().nullable().optional(),
    })
    .safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  try {
    const result = await rebuildDailyPlan(req.user!.id, {
      availableMinutes: body.data.availableMinutes,
    });
    const day = await getMyDay(req.user!.id, body.data.productId ?? null);
    res.json(toJson({ ...result, day }));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Rebuild failed" });
  }
});

router.get("/founder-planner/preferences", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const prefs = await getOrCreatePrefs(req.user!.id);
  res.json(toJson(prefs));
});

router.patch("/founder-planner/preferences", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const body = z
    .object({
      workingMode: z.string().optional(),
      defaultAvailableMinutes: z.number().int().min(30).max(720).optional(),
      maximumTasks: z.number().int().min(1).max(30).optional(),
      includeContent: z.boolean().optional(),
      includeStrategy: z.boolean().optional(),
      revenueFirst: z.boolean().optional(),
    })
    .safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  await getOrCreatePrefs(req.user!.id);
  const [updated] = await db
    .update(plannerPreferencesTable)
    .set(body.data)
    .where(eq(plannerPreferencesTable.userId, req.user!.id))
    .returning();

  await writePlannerAudit({
    userId: req.user!.id,
    eventType: "preferences_updated",
    payload: body.data as Record<string, unknown>,
  });

  res.json(toJson(updated));
});

router.post("/founder-planner/items/:itemId/complete", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const itemId = parseId(req.params.itemId);
  if (!itemId) {
    res.status(400).json({ error: "Invalid item id" });
    return;
  }
  try {
    const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
    const item = await completePlannerItem(req.user!.id, itemId, notes);
    res.json(toJson({ item }));
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Not found" });
  }
});

router.post("/founder-planner/items/:itemId/snooze", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const itemId = parseId(req.params.itemId);
  if (!itemId) {
    res.status(400).json({ error: "Invalid item id" });
    return;
  }
  const days = Number(req.body?.days ?? 1);
  try {
    await snoozePlannerItem(req.user!.id, itemId, Number.isFinite(days) ? days : 1);
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Not found" });
  }
});

router.post("/founder-planner/items/:itemId/delegate", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const itemId = parseId(req.params.itemId);
  if (!itemId) {
    res.status(400).json({ error: "Invalid item id" });
    return;
  }
  try {
    await delegatePlannerItem(req.user!.id, itemId);
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Not found" });
  }
});

/** Approve = complete item + return deepLink for UI to finish entity action. */
router.post("/founder-planner/items/:itemId/approve", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const itemId = parseId(req.params.itemId);
  if (!itemId) {
    res.status(400).json({ error: "Invalid item id" });
    return;
  }
  try {
    const item = await completePlannerItem(req.user!.id, itemId, "Approved from My Day");
    await writePlannerAudit({
      userId: req.user!.id,
      plannerItemId: itemId,
      eventType: "item_approved",
      payload: { deepLink: item.deepLink },
    });
    res.json(toJson({ item, deepLink: item.deepLink }));
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Not found" });
  }
});

router.get("/founder-planner/eod", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const review = await getEndOfDayReview(req.user!.id);
  res.json(toJson(review));
});

router.get("/founder-planner/audit", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const rows = await db
    .select()
    .from(plannerAuditTable)
    .where(eq(plannerAuditTable.userId, req.user!.id))
    .orderBy(desc(plannerAuditTable.createdAt))
    .limit(50);
  res.json({ items: rows.map((r) => toJson(r)) });
});

export default router;
