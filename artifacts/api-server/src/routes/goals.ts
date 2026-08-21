import { Router, type IRouter } from "express";
import { and, eq, type SQL } from "drizzle-orm";
import { db, goalsTable } from "@workspace/db";
import {
  ListGoalsQueryParams,
  ListGoalsResponse,
  CreateGoalBody,
  CreateGoalResponse,
  UpdateGoalParams,
  UpdateGoalBody,
  UpdateGoalResponse,
  DeleteGoalParams,
} from "@workspace/api-zod";
import { requireOwner } from "../middlewares/requireOwner";
import { toJson } from "../lib/serialize";

const router: IRouter = Router();

router.get("/goals", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }

  const query = ListGoalsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions: SQL[] = [];

  // Members see only goals explicitly assigned to them
  if (req.user.role !== "owner") {
    conditions.push(eq(goalsTable.assignedToUserId, req.user.id));
  }

  if (query.data.productId !== undefined)
    conditions.push(eq(goalsTable.productId, query.data.productId));
  if (query.data.kind !== undefined)
    conditions.push(eq(goalsTable.kind, query.data.kind));

  const rows = await db
    .select()
    .from(goalsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(goalsTable.createdAt);
  res.json(ListGoalsResponse.parse(toJson(rows)));
});

// Only owners can create goals
router.post("/goals", requireOwner, async (req, res): Promise<void> => {
  const parsed = CreateGoalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(goalsTable).values(parsed.data).returning();
  res.status(201).json(CreateGoalResponse.parse(toJson(row)));
});

// Members can update currentValue (progress) on their assigned goals; owners can edit anything
router.patch("/goals/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }

  const params = UpdateGoalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateGoalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Members may only update currentValue on their own assigned goals
  if (req.user.role !== "owner") {
    const [goal] = await db.select().from(goalsTable).where(eq(goalsTable.id, params.data.id));
    if (!goal || goal.assignedToUserId !== req.user.id) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const allowedUpdate = { currentValue: parsed.data.currentValue };
    const [row] = await db
      .update(goalsTable)
      .set(allowedUpdate)
      .where(eq(goalsTable.id, params.data.id))
      .returning();
    if (!row) { res.status(404).json({ error: "Goal not found" }); return; }
    res.json(UpdateGoalResponse.parse(toJson(row)));
    return;
  }

  const [row] = await db
    .update(goalsTable)
    .set(parsed.data)
    .where(eq(goalsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }
  res.json(UpdateGoalResponse.parse(toJson(row)));
});

// Only owners can delete goals
router.delete("/goals/:id", requireOwner, async (req, res): Promise<void> => {
  const params = DeleteGoalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(goalsTable)
    .where(eq(goalsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Goal not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
