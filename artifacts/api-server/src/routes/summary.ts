import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  activitiesTable,
  goalsTable,
  productsTable,
  reflectionsTable,
} from "@workspace/db";
import {
  GetTodaySummaryQueryParams,
  GetTodaySummaryResponse,
  GetNumberSummaryResponse,
} from "@workspace/api-zod";
import { computeFocusSplit, computePaceAlerts, coachPush } from "../lib/coach";

const router: IRouter = Router();

router.get("/summary/today", async (req, res): Promise<void> => {
  const query = GetTodaySummaryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const date = query.data.date ?? new Date().toISOString().slice(0, 10);

  const activities = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.date, date));
  const goals = await db.select().from(goalsTable);
  const [lastReflection] = await db
    .select()
    .from(reflectionsTable)
    .orderBy(desc(reflectionsTable.date))
    .limit(1);

  const focusGuard = computeFocusSplit(activities);
  const paceAlerts = computePaceAlerts(goals, date);
  const counts = {
    planned: activities.length,
    done: activities.filter((a) => a.status === "done").length,
    skipped: activities.filter((a) => a.status === "skipped").length,
    delegated: activities.filter((a) => a.status === "delegated").length,
    deferred: activities.filter((a) => a.status === "deferred").length,
  };

  res.json(
    GetTodaySummaryResponse.parse({
      date,
      coachPush: coachPush(
        focusGuard,
        counts.done,
        counts.planned,
        paceAlerts,
        lastReflection ?? null,
      ),
      focusGuard,
      counts,
      paceAlerts,
    }),
  );
});

router.get("/summary/number", async (_req, res): Promise<void> => {
  const goals = await db.select().from(goalsTable);
  const products = await db.select().from(productsTable);

  const revenueGoals = goals.filter((g) => g.kind === "revenue");
  const perProduct = products
    .map((p) => {
      const pg = revenueGoals.filter((g) => g.productId === p.id);
      return {
        productId: p.id,
        productName: p.name,
        target: pg.reduce((s, g) => s + g.targetValue, 0),
        current: pg.reduce((s, g) => s + g.currentValue, 0),
      };
    })
    .filter((p) => p.target > 0 || p.current > 0);

  const globalRevenue = revenueGoals.filter((g) => g.productId === null);
  const totalTarget =
    perProduct.reduce((s, p) => s + p.target, 0) +
    globalRevenue.reduce((s, g) => s + g.targetValue, 0);
  const totalCurrent =
    perProduct.reduce((s, p) => s + p.current, 0) +
    globalRevenue.reduce((s, g) => s + g.currentValue, 0);

  res.json(
    GetNumberSummaryResponse.parse({
      totalTarget,
      totalCurrent,
      pct:
        totalTarget > 0
          ? Math.round((totalCurrent / totalTarget) * 1000) / 10
          : 0,
      perProduct,
    }),
  );
});

export default router;
