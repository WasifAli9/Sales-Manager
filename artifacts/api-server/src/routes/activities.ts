import { Router, type IRouter } from "express";
import { and, eq, asc, desc, lt, gte, type SQL } from "drizzle-orm";
import {
  db,
  activitiesTable,
  productsTable,
  platformStatesTable,
  aiAnalysesTable,
  type Product,
} from "@workspace/db";
import { requireOwner } from "../middlewares/requireOwner";
import {
  ListActivitiesQueryParams,
  ListActivitiesResponse,
  CreateActivityBody,
  CreateActivityResponse,
  UpdateActivityParams,
  UpdateActivityBody,
  UpdateActivityResponse,
  DeleteActivityParams,
  GenerateActivitiesBody,
  GenerateActivitiesResponse,
} from "@workspace/api-zod";
import { runJson } from "../lib/ai";

import { toJson } from "../lib/serialize";

const router: IRouter = Router();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

router.get("/activities", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }

  const query = ListActivitiesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const conditions: SQL[] = [];

  // Members see only activities assigned to them
  if (req.user.role !== "owner") {
    conditions.push(eq(activitiesTable.assignedToUserId, req.user.id));
  }

  if (query.data.date !== undefined)
    conditions.push(eq(activitiesTable.date, query.data.date));
  if (query.data.beforeDate !== undefined)
    conditions.push(lt(activitiesTable.date, query.data.beforeDate));
  if (query.data.productId !== undefined)
    conditions.push(eq(activitiesTable.productId, query.data.productId));
  if (query.data.status !== undefined)
    conditions.push(eq(activitiesTable.status, query.data.status));

  // When browsing prior incomplete days, keep the window recent and newest-first.
  const browsingPrior = query.data.beforeDate !== undefined && query.data.date === undefined;
  if (browsingPrior) {
    const cutoff = new Date(`${query.data.beforeDate}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - 21);
    conditions.push(gte(activitiesTable.date, cutoff.toISOString().slice(0, 10)));
  }

  const rows = await db
    .select()
    .from(activitiesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(
      ...(browsingPrior
        ? [desc(activitiesTable.date), asc(activitiesTable.priority), asc(activitiesTable.id)]
        : [asc(activitiesTable.priority), asc(activitiesTable.id)]),
    );
  res.json(ListActivitiesResponse.parse(toJson(rows)));
});

router.post("/activities", async (req, res): Promise<void> => {
  const parsed = CreateActivityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(activitiesTable)
    .values({ ...parsed.data, source: "manual" })
    .returning();
  res.status(201).json(CreateActivityResponse.parse(toJson(row)));
});

router.patch("/activities/:id", async (req, res): Promise<void> => {
  const params = UpdateActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateActivityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const patch: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "done") patch["completedAt"] = new Date();
  else if (parsed.data.status !== undefined) patch["completedAt"] = null;
  const [row] = await db
    .update(activitiesTable)
    .set(patch)
    .where(eq(activitiesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }
  // Keep platform readiness fresh: mark activity on the platform
  if (parsed.data.status === "done" && row.platform && row.productId) {
    await db
      .update(platformStatesTable)
      .set({ lastActivityAt: new Date() })
      .where(
        and(
          eq(platformStatesTable.productId, row.productId),
          eq(platformStatesTable.platform, row.platform),
        ),
      );
  }
  res.json(UpdateActivityResponse.parse(toJson(row)));
});

router.delete("/activities/:id", async (req, res): Promise<void> => {
  const params = DeleteActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(activitiesTable)
    .where(eq(activitiesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Activity not found" });
    return;
  }
  res.sendStatus(204);
});

const GENERATION_SYSTEM = `You are a direct-response B2B growth strategist generating TODAY'S ranked selling activity list for a solo founder with NO customers and zero ad budget.
Enforce the 90/10 rule strictly: at least 90% of total effort minutes must be SELL or CX activities. At most one small BUILD/ADMIN item, if any.
Stage guide: not_started platforms get setup-for-selling actions ("optimize profile + connect with 20 ICP"); active platforms get volume actions ("post + 15 DMs + book 2 calls"); warming platforms get consistency actions.
Write titles human and specific — no AI tells, no filler. Every activity must be a concrete, finishable action with realistic effort minutes (15-90).
Return ONLY strict JSON: {"activities":[{"productId":number,"platform":"linkedin|apollo|email|webinar|youtube|x|canva|heygen|gohighlevel|community|referral|other","category":"SELL|CX|BUILD|ADMIN","title":"...","description":"...","effortMinutes":number,"priority":1|2|3}]}
Generate 6-10 activities total, ranked by leverage (priority 1 = highest). Order platforms by where the highest-leverage next selling action is given each platform's readiness stage.`;

router.post("/activities/generate", async (req, res): Promise<void> => {
  const parsed = GenerateActivitiesBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const date = parsed.data.date ?? today();

  let products: Product[] = await db
    .select()
    .from(productsTable)
    .where(
      parsed.data.productId !== undefined
        ? eq(productsTable.id, parsed.data.productId)
        : undefined,
    );
  products = products.filter(
    (p) => p.status === "active" || p.status === "launching",
  );
  if (products.length === 0) {
    res.status(400).json({ error: "No active products to plan for" });
    return;
  }

  const states = await db.select().from(platformStatesTable);
  const analyses = await db
    .select({
      productId: aiAnalysesTable.productId,
      kind: aiAnalysesTable.kind,
      content: aiAnalysesTable.content,
    })
    .from(aiAnalysesTable);

  const context = products
    .map((p) => {
      const pStates = states
        .filter((s) => s.productId === p.id)
        .map((s) => `${s.platform}=${s.stage}`)
        .join(", ");
      const pAnalyses = analyses
        .filter((a) => a.productId === p.id && (a.kind === "gtm" || a.kind === "cadence"))
        .map((a) => `${a.kind}: ${JSON.stringify(a.content).slice(0, 1500)}`)
        .join("\n");
      return `Product id=${p.id} "${p.name}" (${p.status}): ${p.description ?? p.tagline ?? ""}. Target market: ${p.targetMarket ?? "n/a"}. Platform stages: ${pStates || "none tracked"}.\n${pAnalyses || "No cached strategy yet — default to LinkedIn + Apollo + email fundamentals."}`;
    })
    .join("\n\n");

  const { json } = await runJson(
    GENERATION_SYSTEM,
    `Date: ${date}.\n\n${context}\n\nGenerate today's ranked list now.`,
  );

  const items = (json as { activities?: unknown[] })?.activities;
  if (!Array.isArray(items) || items.length === 0) {
    res.status(500).json({ error: "AI returned no activities — try again" });
    return;
  }

  const validProductIds = new Set(products.map((p) => p.id));
  const values = items
    .map((raw) => {
      const it = raw as Record<string, unknown>;
      const category = String(it["category"] ?? "SELL");
      return {
        date,
        productId: validProductIds.has(Number(it["productId"]))
          ? Number(it["productId"])
          : null,
        platform: typeof it["platform"] === "string" ? it["platform"] : "other",
        category: ["SELL", "CX", "BUILD", "ADMIN"].includes(category)
          ? category
          : "SELL",
        title: String(it["title"] ?? "").slice(0, 300),
        description:
          typeof it["description"] === "string" ? it["description"] : null,
        effortMinutes: Math.min(
          180,
          Math.max(5, Number(it["effortMinutes"]) || 30),
        ),
        priority: [1, 2, 3].includes(Number(it["priority"]))
          ? Number(it["priority"])
          : 2,
        status: "pending",
        source: "ai",
      };
    })
    .filter((v) => v.title.length > 0)
    .slice(0, 10);

  if (values.length === 0) {
    res.status(500).json({ error: "AI returned no usable activities — try again" });
    return;
  }

  // Enforce the 90/10 rule server-side: keep at most one BUILD/ADMIN item,
  // and only if it fits within 10% of total effort minutes.
  const sellCx = values.filter(
    (v) => v.category === "SELL" || v.category === "CX",
  );
  const buildAdmin = values
    .filter((v) => v.category === "BUILD" || v.category === "ADMIN")
    .sort((a, b) => a.effortMinutes - b.effortMinutes);
  const sellCxMinutes = sellCx.reduce((s, v) => s + v.effortMinutes, 0);
  const kept = [...sellCx];
  const smallest = buildAdmin[0];
  if (
    smallest &&
    sellCxMinutes > 0 &&
    smallest.effortMinutes <= (sellCxMinutes + smallest.effortMinutes) * 0.1
  ) {
    kept.push(smallest);
  }
  if (kept.length === 0) {
    res.status(500).json({ error: "AI plan had no selling activities — try again" });
    return;
  }
  kept.sort((a, b) => a.priority - b.priority);

  const rows = await db.insert(activitiesTable).values(kept).returning();
  res.status(201).json(GenerateActivitiesResponse.parse(toJson(rows)));
});

export default router;
