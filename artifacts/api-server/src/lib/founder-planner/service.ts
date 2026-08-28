/**
 * Founder Daily Planner — events, priority engine, plan rebuild, item actions.
 */
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  agentEventsTable,
  dailyPlansTable,
  pipelineDealsTable,
  plannerAuditTable,
  plannerItemsTable,
  plannerOutcomesTable,
  plannerPreferencesTable,
  productsTable,
  usersTable,
} from "@workspace/db/schema";
import {
  computeFounderScore,
  estimateMinutes,
  priorityLevel,
  whyItMatters,
} from "./scoring";

export type EmitEventInput = {
  productId?: number | null;
  sourceAgent: string;
  sourceEntityType?: string;
  sourceEntityId?: string | number;
  eventType: string;
  title: string;
  description?: string;
  commercialValue?: number;
  probability?: number;
  urgency?: number;
  humanDependency?: number;
  riskScore?: number;
  strategicScore?: number;
  confidence?: number;
  recommendedAction?: string;
  actionType?: string;
  executionType?: "ai_handles" | "user_approves" | "user_acts";
  dueAt?: Date | null;
  payload?: Record<string, unknown>;
};

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function emitAgentEvent(input: EmitEventInput) {
  const entityId = input.sourceEntityId != null ? String(input.sourceEntityId) : "none";
  const dedupeKey = `${input.sourceAgent}:${input.eventType}:${entityId}:${dayKey()}`;

  const [existing] = await db
    .select()
    .from(agentEventsTable)
    .where(and(eq(agentEventsTable.dedupeKey, dedupeKey), eq(agentEventsTable.status, "open")))
    .limit(1);
  if (existing) {
    const [updated] = await db
      .update(agentEventsTable)
      .set({
        title: input.title,
        description: input.description ?? existing.description,
        commercialValue: input.commercialValue ?? existing.commercialValue,
        probability: input.probability ?? existing.probability,
        urgency: input.urgency ?? existing.urgency,
        humanDependency: input.humanDependency ?? existing.humanDependency,
        riskScore: input.riskScore ?? existing.riskScore,
        strategicScore: input.strategicScore ?? existing.strategicScore,
        recommendedAction: input.recommendedAction ?? existing.recommendedAction,
        dueAt: input.dueAt === undefined ? existing.dueAt : input.dueAt,
        payload: input.payload ?? existing.payload,
      })
      .where(eq(agentEventsTable.id, existing.id))
      .returning();
    return { event: updated, created: false };
  }

  const [created] = await db
    .insert(agentEventsTable)
    .values({
      productId: input.productId ?? null,
      sourceAgent: input.sourceAgent,
      sourceEntityType: input.sourceEntityType ?? null,
      sourceEntityId: entityId === "none" ? null : entityId,
      eventType: input.eventType,
      title: input.title,
      description: input.description ?? null,
      commercialValue: input.commercialValue ?? 0,
      probability: input.probability ?? 50,
      urgency: input.urgency ?? 50,
      humanDependency: input.humanDependency ?? 50,
      riskScore: input.riskScore ?? 0,
      strategicScore: input.strategicScore ?? 0,
      confidence: input.confidence ?? 70,
      recommendedAction: input.recommendedAction ?? null,
      actionType: input.actionType ?? null,
      executionType: input.executionType ?? "user_acts",
      dueAt: input.dueAt ?? null,
      status: "open",
      dedupeKey,
      payload: input.payload ?? null,
    })
    .returning();

  return { event: created, created: true };
}

export async function writePlannerAudit(event: {
  userId?: string | null;
  dailyPlanId?: number | null;
  plannerItemId?: number | null;
  eventType: string;
  payload?: Record<string, unknown>;
}) {
  await db.insert(plannerAuditTable).values({
    userId: event.userId ?? null,
    dailyPlanId: event.dailyPlanId ?? null,
    plannerItemId: event.plannerItemId ?? null,
    eventType: event.eventType,
    payload: event.payload ?? null,
  });
}

export { computeFounderScore, estimateMinutes, priorityLevel, whyItMatters } from "./scoring";

export const DEFAULT_PREFS = {
  workingMode: "balanced",
  defaultAvailableMinutes: 240,
  maximumTasks: 8,
  includeContent: false,
  includeStrategy: true,
  revenueFirst: false,
};

export async function getOrCreatePrefs(userId: string) {
  const [existing] = await db
    .select()
    .from(plannerPreferencesTable)
    .where(eq(plannerPreferencesTable.userId, userId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(plannerPreferencesTable)
    .values({ userId, ...DEFAULT_PREFS })
    .returning();
  return created;
}

async function productArrBenchmarks(): Promise<Map<number, { median: number; p75: number }>> {
  const deals = await db
    .select({
      productId: pipelineDealsTable.productId,
      arr: pipelineDealsTable.arr,
      value: pipelineDealsTable.value,
      stage: pipelineDealsTable.stage,
    })
    .from(pipelineDealsTable)
    .where(notInArray(pipelineDealsTable.stage, ["won", "lost"]));

  const byProduct = new Map<number, number[]>();
  for (const d of deals) {
    const arr = parseFloat(d.arr ?? d.value ?? "0") || 0;
    if (arr <= 0) continue;
    const list = byProduct.get(d.productId) ?? [];
    list.push(arr);
    byProduct.set(d.productId, list);
  }

  const out = new Map<number, { median: number; p75: number }>();
  for (const [pid, vals] of byProduct) {
    vals.sort((a, b) => a - b);
    const mid = vals[Math.floor(vals.length / 2)] ?? 5000;
    const p75 = vals[Math.floor(vals.length * 0.75)] ?? mid;
    out.set(pid, { median: mid, p75 });
  }
  return out;
}

function normaliseCommercial(rawArrHint: number, bench: { median: number; p75: number } | undefined): number {
  // rawArrHint may already be 0-100 from emitter; if >100 treat as ARR
  if (rawArrHint <= 100) return Math.max(0, Math.min(100, rawArrHint));
  const median = bench?.median || 5000;
  const p75 = bench?.p75 || median * 1.5;
  if (rawArrHint >= p75 * 1.5) return 100;
  if (rawArrHint >= p75) return 75;
  if (rawArrHint >= median) return 50;
  if (rawArrHint >= median * 0.4) return 25;
  return 0;
}

function deepLinkForEvent(ev: typeof agentEventsTable.$inferSelect): string | null {
  const pid = ev.productId;
  if (!pid) return null;
  if (ev.sourceAgent === "reply_agent") return `/products/${pid}/ai-inbox`;
  if (ev.sourceAgent === "opportunity_agent" && ev.sourceEntityId) {
    return `/products/${pid}/opportunities/${ev.sourceEntityId}`;
  }
  if (ev.sourceAgent === "lead_intelligence") return `/products/${pid}/lead-intelligence`;
  return `/products/${pid}`;
}

/** Supersede weaker open events for the same entity. */
export async function supersedeDuplicateEvents() {
  const open = await db
    .select()
    .from(agentEventsTable)
    .where(eq(agentEventsTable.status, "open"))
    .orderBy(desc(agentEventsTable.createdAt));

  const bestByEntity = new Map<string, typeof open[0]>();
  for (const ev of open) {
    if (!ev.sourceEntityId || !ev.sourceAgent) continue;
    const key = `${ev.sourceAgent}:${ev.sourceEntityType}:${ev.sourceEntityId}`;
    const score =
      (ev.commercialValue ?? 0) + (ev.urgency ?? 0) + (ev.riskScore ?? 0) + (ev.humanDependency ?? 0);
    const prev = bestByEntity.get(key);
    if (!prev) {
      bestByEntity.set(key, ev);
      continue;
    }
    const prevScore =
      (prev.commercialValue ?? 0) + (prev.urgency ?? 0) + (prev.riskScore ?? 0) + (prev.humanDependency ?? 0);
    if (score > prevScore) {
      await db.update(agentEventsTable).set({ status: "superseded", resolvedAt: new Date() }).where(eq(agentEventsTable.id, prev.id));
      bestByEntity.set(key, ev);
    } else if (ev.id !== prev.id) {
      await db.update(agentEventsTable).set({ status: "superseded", resolvedAt: new Date() }).where(eq(agentEventsTable.id, ev.id));
    }
  }
}

export async function rebuildDailyPlan(userId: string, opts?: {
  availableMinutes?: number;
}): Promise<{ planId: number; itemCount: number }> {
  const prefs = await getOrCreatePrefs(userId);
  await supersedeDuplicateEvents();

  const planDate = dayKey();
  const available = opts?.availableMinutes ?? prefs.defaultAvailableMinutes;

  let [plan] = await db
    .select()
    .from(dailyPlansTable)
    .where(and(eq(dailyPlansTable.userId, userId), eq(dailyPlansTable.planDate, planDate)))
    .limit(1);

  if (!plan) {
    [plan] = await db
      .insert(dailyPlansTable)
      .values({
        userId,
        planDate,
        availableMinutes: available,
        mode: prefs.revenueFirst ? "revenue_first" : prefs.workingMode ?? "balanced",
      })
      .returning();
  } else {
    [plan] = await db
      .update(dailyPlansTable)
      .set({
        availableMinutes: available,
        lastReplannedAt: new Date(),
        mode: prefs.revenueFirst ? "revenue_first" : prefs.workingMode ?? "balanced",
      })
      .where(eq(dailyPlansTable.id, plan.id))
      .returning();
  }

  // Clear non-terminal items for rebuild (keep done/snoozed today)
  await db
    .delete(plannerItemsTable)
    .where(and(
      eq(plannerItemsTable.dailyPlanId, plan.id),
      inArray(plannerItemsTable.status, ["planned", "in_progress", "superseded"]),
    ));

  const conditions = [eq(agentEventsTable.status, "open")];
  if (!prefs.includeContent) {
    conditions.push(sql`${agentEventsTable.sourceAgent} <> 'content'`);
  }

  const events = await db
    .select()
    .from(agentEventsTable)
    .where(and(...conditions))
    .orderBy(desc(agentEventsTable.createdAt))
    .limit(200);

  const benches = await productArrBenchmarks();
  const revenueFirst = !!prefs.revenueFirst;

  type Scored = {
    event: typeof events[0];
    score: number;
    level: string;
    commercial: number;
    minutes: number;
    why: string;
  };

  const scored: Scored[] = [];
  for (const ev of events) {
    if (!prefs.includeStrategy && ev.sourceAgent === "strategy") continue;
    const commercial = normaliseCommercial(ev.commercialValue ?? 0, ev.productId ? benches.get(ev.productId) : undefined);
    const score = computeFounderScore(
      {
        commercial,
        probability: ev.probability ?? 50,
        urgency: ev.urgency ?? 50,
        humanDependency: ev.humanDependency ?? 50,
        risk: ev.riskScore ?? 0,
        strategic: ev.strategicScore ?? 0,
      },
      revenueFirst,
    );
    scored.push({
      event: ev,
      score,
      level: priorityLevel(score),
      commercial,
      minutes: estimateMinutes(ev.actionType, ev.executionType),
      why: whyItMatters({
        commercial,
        urgency: ev.urgency ?? 50,
        risk: ev.riskScore ?? 0,
        humanDependency: ev.humanDependency ?? 50,
        title: ev.title,
      }),
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // Greedy pack into available minutes (ai_handles don't consume budget but still listed)
  const maxTasks = prefs.maximumTasks;
  let remaining = available;
  const selected: Scored[] = [];
  for (const s of scored) {
    if (selected.length >= maxTasks * 2) break; // allow extra ai_handles
    if (s.event.executionType === "ai_handles") {
      selected.push(s);
      continue;
    }
    if (s.minutes > remaining && selected.filter((x) => x.event.executionType !== "ai_handles").length > 0) {
      // still take Critical even if over budget
      if (s.level !== "critical") continue;
    }
    selected.push(s);
    if (s.event.executionType !== "ai_handles") remaining -= s.minutes;
    if (selected.filter((x) => x.event.executionType !== "ai_handles").length >= maxTasks) {
      // keep collecting ai_handles only
      continue;
    }
  }

  // Time-block from 09:00 local-ish (UTC for storage)
  let cursor = new Date();
  cursor.setUTCHours(9, 0, 0, 0);
  let rank = 1;
  for (const s of selected) {
    const start = new Date(cursor);
    const end = new Date(cursor.getTime() + Math.max(s.minutes, 1) * 60_000);
    if (s.event.executionType !== "ai_handles") cursor = end;

    await db.insert(plannerItemsTable).values({
      dailyPlanId: plan.id,
      userId,
      productId: s.event.productId,
      title: s.event.title,
      description: s.event.description,
      executionType: s.event.executionType,
      priorityScore: s.score,
      priorityLevel: s.level,
      commercialValue: s.commercial,
      estimatedMinutes: s.minutes,
      whyItMatters: s.why,
      dueAt: s.event.dueAt,
      plannedStart: s.event.executionType === "ai_handles" ? null : start,
      plannedEnd: s.event.executionType === "ai_handles" ? null : end,
      status: "planned",
      sourceEventIds: [s.event.id],
      actionType: s.event.actionType,
      deepLink: deepLinkForEvent(s.event),
      rank: rank++,
    });
  }

  await writePlannerAudit({
    userId,
    dailyPlanId: plan.id,
    eventType: "plan_rebuilt",
    payload: { itemCount: selected.length, availableMinutes: available },
  });

  return { planId: plan.id, itemCount: selected.length };
}

export async function getMyDay(userId: string, productId?: number | null) {
  const planDate = dayKey();
  let [plan] = await db
    .select()
    .from(dailyPlansTable)
    .where(and(eq(dailyPlansTable.userId, userId), eq(dailyPlansTable.planDate, planDate)))
    .limit(1);

  if (!plan) {
    await rebuildDailyPlan(userId);
    [plan] = await db
      .select()
      .from(dailyPlansTable)
      .where(and(eq(dailyPlansTable.userId, userId), eq(dailyPlansTable.planDate, planDate)))
      .limit(1);
  }

  if (!plan) return null;

  const itemConditions = [
    eq(plannerItemsTable.dailyPlanId, plan.id),
    notInArray(plannerItemsTable.status, ["superseded"]),
  ];
  if (productId) itemConditions.push(eq(plannerItemsTable.productId, productId));

  const items = await db
    .select({
      item: plannerItemsTable,
      productName: productsTable.name,
    })
    .from(plannerItemsTable)
    .leftJoin(productsTable, eq(productsTable.id, plannerItemsTable.productId))
    .where(and(...itemConditions))
    .orderBy(plannerItemsTable.rank);

  const active = items.filter((i) => !["done", "dismissed", "snoozed", "delegated"].includes(i.item.status));
  const oneThing = active.find((i) => i.item.executionType === "user_acts")
    ?? active.find((i) => i.item.executionType === "user_approves")
    ?? null;

  const needsApproval = active.filter((i) => i.item.executionType === "user_approves");
  const userActs = active.filter((i) => i.item.executionType === "user_acts");
  const aiHandles = active.filter((i) => i.item.executionType === "ai_handles");
  const atRisk = active.filter((i) => i.item.priorityLevel === "critical" || (i.item.priorityScore ?? 0) >= 85);
  const critical = active.filter((i) => i.item.priorityLevel === "critical");
  const done = items.filter((i) => i.item.status === "done");

  const prefs = await getOrCreatePrefs(userId);

  return {
    plan,
    preferences: prefs,
    oneThing: oneThing
      ? { ...oneThing.item, productName: oneThing.productName }
      : null,
    needsApproval: needsApproval.map((i) => ({ ...i.item, productName: i.productName })),
    userActs: userActs.map((i) => ({ ...i.item, productName: i.productName })),
    aiHandles: aiHandles.map((i) => ({ ...i.item, productName: i.productName })),
    atRisk: atRisk.map((i) => ({ ...i.item, productName: i.productName })),
    critical: critical.map((i) => ({ ...i.item, productName: i.productName })),
    doneToday: done.map((i) => ({ ...i.item, productName: i.productName })),
    allItems: items.map((i) => ({ ...i.item, productName: i.productName })),
    summary: {
      approvals: needsApproval.length,
      acts: userActs.length,
      aiHandling: aiHandles.length,
      atRisk: atRisk.length,
      critical: critical.length,
      completed: done.length,
    },
  };
}

export async function completePlannerItem(userId: string, itemId: number, notes?: string) {
  const [item] = await db.select().from(plannerItemsTable).where(and(eq(plannerItemsTable.id, itemId), eq(plannerItemsTable.userId, userId))).limit(1);
  if (!item) throw new Error("Item not found");

  const [updated] = await db
    .update(plannerItemsTable)
    .set({ status: "done", completedAt: new Date() })
    .where(eq(plannerItemsTable.id, itemId))
    .returning();

  await db.insert(plannerOutcomesTable).values({
    plannerItemId: itemId,
    outcomeType: "completed",
    notes: notes ?? null,
  });

  // Resolve source events
  const ids = (item.sourceEventIds ?? []) as number[];
  if (ids.length) {
    await db
      .update(agentEventsTable)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(inArray(agentEventsTable.id, ids));
  }

  await writePlannerAudit({
    userId,
    dailyPlanId: item.dailyPlanId,
    plannerItemId: itemId,
    eventType: "item_completed",
  });

  await rebuildDailyPlan(userId);
  return updated;
}

export async function snoozePlannerItem(userId: string, itemId: number, days = 1) {
  const [item] = await db.select().from(plannerItemsTable).where(and(eq(plannerItemsTable.id, itemId), eq(plannerItemsTable.userId, userId))).limit(1);
  if (!item) throw new Error("Item not found");

  const due = new Date();
  due.setDate(due.getDate() + days);

  await db.update(plannerItemsTable).set({ status: "snoozed", dueAt: due }).where(eq(plannerItemsTable.id, itemId));
  await db.insert(plannerOutcomesTable).values({
    plannerItemId: itemId,
    outcomeType: "snoozed",
    notes: `Snoozed ${days} day(s)`,
  });

  const ids = (item.sourceEventIds ?? []) as number[];
  if (ids.length) {
    await db.update(agentEventsTable).set({ dueAt: due }).where(inArray(agentEventsTable.id, ids));
  }

  await writePlannerAudit({ userId, plannerItemId: itemId, eventType: "item_snoozed", payload: { days } });
  await rebuildDailyPlan(userId);
}

export async function delegatePlannerItem(userId: string, itemId: number) {
  const [item] = await db.select().from(plannerItemsTable).where(and(eq(plannerItemsTable.id, itemId), eq(plannerItemsTable.userId, userId))).limit(1);
  if (!item) throw new Error("Item not found");

  await db
    .update(plannerItemsTable)
    .set({ status: "delegated", executionType: "ai_handles" })
    .where(eq(plannerItemsTable.id, itemId));

  const ids = (item.sourceEventIds ?? []) as number[];
  if (ids.length) {
    await db
      .update(agentEventsTable)
      .set({ executionType: "ai_handles", humanDependency: 20 })
      .where(inArray(agentEventsTable.id, ids));
  }

  await db.insert(plannerOutcomesTable).values({
    plannerItemId: itemId,
    outcomeType: "delegated",
  });
  await writePlannerAudit({ userId, plannerItemId: itemId, eventType: "item_delegated" });
  await rebuildDailyPlan(userId);
}

export async function getEndOfDayReview(userId: string) {
  const planDate = dayKey();
  const [plan] = await db
    .select()
    .from(dailyPlansTable)
    .where(and(eq(dailyPlansTable.userId, userId), eq(dailyPlansTable.planDate, planDate)))
    .limit(1);
  if (!plan) return { completed: [], remaining: [], message: "No plan generated today." };

  const items = await db
    .select()
    .from(plannerItemsTable)
    .where(eq(plannerItemsTable.dailyPlanId, plan.id));

  const completed = items.filter((i) => i.status === "done");
  const remaining = items.filter((i) => ["planned", "in_progress"].includes(i.status));

  // Preview tomorrow from open events
  const openEvents = await db
    .select()
    .from(agentEventsTable)
    .where(eq(agentEventsTable.status, "open"))
    .orderBy(desc(agentEventsTable.urgency))
    .limit(5);

  return {
    completed: completed.map((c) => ({ id: c.id, title: c.title, priorityLevel: c.priorityLevel })),
    remaining: remaining.map((c) => ({ id: c.id, title: c.title, priorityLevel: c.priorityLevel })),
    tomorrowCandidates: openEvents.map((e) => ({ id: e.id, title: e.title, eventType: e.eventType })),
    message: `You completed ${completed.length} priority item(s). ${remaining.length} still open. ${openEvents.length} signals already queued for tomorrow.`,
  };
}

export async function rebuildPlansForAllActiveUsers(): Promise<{ users: number }> {
  const prefs = await db.select({ userId: plannerPreferencesTable.userId }).from(plannerPreferencesTable);
  const recent = await db.select({ userId: dailyPlansTable.userId }).from(dailyPlansTable).limit(100);
  const owners = await db.select({ id: usersTable.id }).from(usersTable).limit(200);
  const userIds = [
    ...prefs.map((p) => p.userId),
    ...recent.map((r) => r.userId),
    ...owners.map((u) => u.id),
  ];
  const unique = [...new Set(userIds)];
  for (const uid of unique) {
    try {
      await rebuildDailyPlan(uid);
    } catch {
      // continue
    }
  }
  return { users: unique.length };
}
