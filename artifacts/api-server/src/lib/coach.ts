import type { Activity, Goal, Reflection } from "@workspace/db";

export interface FocusSplit {
  sellCxMinutes: number;
  buildAdminMinutes: number;
  sellCxPct: number;
  status: "on_track" | "warning" | "drift";
}

export function computeFocusSplit(activities: Activity[]): FocusSplit {
  let sellCx = 0;
  let buildAdmin = 0;
  for (const a of activities) {
    if (a.status === "skipped" || a.status === "delegated" || a.status === "deferred")
      continue;
    if (a.category === "SELL" || a.category === "CX") sellCx += a.effortMinutes;
    else buildAdmin += a.effortMinutes;
  }
  const total = sellCx + buildAdmin;
  const pct = total === 0 ? 100 : (sellCx / total) * 100;
  const status: FocusSplit["status"] =
    pct >= 90 ? "on_track" : pct >= 80 ? "warning" : "drift";
  return {
    sellCxMinutes: sellCx,
    buildAdminMinutes: buildAdmin,
    sellCxPct: Math.round(pct * 10) / 10,
    status,
  };
}

export interface PaceAlert {
  goalId: number;
  title: string;
  daysRemaining: number;
  requiredDailyPace: number;
  currentValue: number;
  targetValue: number;
  unit: string;
}

export function computePaceAlerts(goals: Goal[], today: string): PaceAlert[] {
  const alerts: PaceAlert[] = [];
  const now = new Date(`${today}T00:00:00Z`).getTime();
  for (const g of goals) {
    if (g.kind !== "thirty_day" || !g.deadline) continue;
    const deadline = new Date(`${g.deadline}T00:00:00Z`).getTime();
    const daysRemaining = Math.max(
      0,
      Math.ceil((deadline - now) / 86_400_000),
    );
    const remaining = Math.max(0, g.targetValue - g.currentValue);
    if (remaining <= 0) continue;
    const pace = daysRemaining > 0 ? remaining / daysRemaining : remaining;
    alerts.push({
      goalId: g.id,
      title: g.title,
      daysRemaining,
      requiredDailyPace: Math.round(pace * 100) / 100,
      currentValue: g.currentValue,
      targetValue: g.targetValue,
      unit: g.unit,
    });
  }
  return alerts;
}

/**
 * Deterministic morning push — sharp on the miss, specific on the fix,
 * relentless on the next action. Aimed at behavior, never identity.
 * Kept rule-based so the home screen loads instantly with zero LLM cost.
 */
export function coachPush(
  split: FocusSplit,
  doneCount: number,
  plannedCount: number,
  alerts: PaceAlert[],
  lastReflection: Reflection | null,
): string {
  if (plannedCount === 0) {
    return "No plan, no pipeline. Generate today's list and get the first outreach out before coffee.";
  }
  if (split.status === "drift") {
    return `${split.buildAdminMinutes} minutes on tweaks against ${split.sellCxMinutes} selling. That gap is your missing revenue — delegate the build work and go book a call.`;
  }
  if (split.status === "warning") {
    return "You're sliding toward tinkering. Protect your selling hours — the next task you touch should put you in front of a buyer.";
  }
  if (alerts.length > 0) {
    const a = alerts[0]!;
    return `${a.daysRemaining} days left on "${a.title}" — you need ${a.requiredDailyPace}/day. Today's number decides whether that goal is real.`;
  }
  if (doneCount === 0) {
    return "The magic is on the other side of discomfort. First DM, first call, first ask — do the scariest one first.";
  }
  return `${doneCount} of ${plannedCount} done and 90/10 holding. Go big — stack one more conversation before the day ends.`;
}
