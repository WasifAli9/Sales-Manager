/** Pure Founder Priority Engine helpers (no DB). */

export function priorityLevel(score: number): string {
  if (score >= 90) return "critical";
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

export function estimateMinutes(actionType: string | null | undefined, executionType: string): number {
  if (executionType === "ai_handles") return 0;
  if (executionType === "user_approves") return 5;
  switch (actionType) {
    case "book_discovery":
    case "follow_up_demo":
    case "check_in":
      return 15;
    case "re_engage":
    case "handle_objection":
      return 20;
    case "map_stakeholder":
    case "advance_proposal":
      return 25;
    case "call":
    case "meeting":
      return 30;
    default:
      return 15;
  }
}

export function computeFounderScore(
  dims: {
    commercial: number;
    probability: number;
    urgency: number;
    humanDependency: number;
    risk: number;
    strategic: number;
  },
  revenueFirst: boolean,
): number {
  const w = revenueFirst
    ? { c: 0.4, p: 0.15, u: 0.25, h: 0.1, r: 0.08, s: 0.02 }
    : { c: 0.3, p: 0.2, u: 0.2, h: 0.15, r: 0.1, s: 0.05 };
  const score =
    dims.commercial * w.c +
    dims.probability * w.p +
    dims.urgency * w.u +
    dims.humanDependency * w.h +
    dims.risk * w.r +
    dims.strategic * w.s;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function whyItMatters(dims: {
  commercial: number;
  urgency: number;
  risk: number;
  humanDependency: number;
  title: string;
}): string {
  const parts: string[] = [];
  if (dims.commercial >= 75) parts.push("high commercial value");
  else if (dims.commercial >= 50) parts.push("meaningful commercial upside");
  if (dims.urgency >= 75) parts.push("time-sensitive");
  if (dims.risk >= 60) parts.push("elevated deal/reply risk");
  if (dims.humanDependency >= 70) parts.push("needs your judgement");
  if (!parts.length) parts.push("worthy of founder attention today");
  return `${dims.title}: ${parts.join("; ")}.`;
}
