import { Router, type IRouter } from "express";
import { desc, eq, gte, lt, and, sql } from "drizzle-orm";
import { db, reflectionsTable, activitiesTable, goalsTable, emailSendsTable, leadsTable, productsTable } from "@workspace/db";
import {
  ListReflectionsResponse,
  CreateReflectionBody,
  CreateReflectionResponse,
} from "@workspace/api-zod";
import { z } from "zod";
import { runJson } from "../lib/ai";
import { computeFocusSplit, computePaceAlerts } from "../lib/coach";
import { sendEmail, coachPushEmail } from "../lib/email";
import { toJson } from "../lib/serialize";

/** Build outreach summary lines for a given date, scoped to a user (or all for owner). */
async function getOutreachLines(date: string, userId: string, isOwner: boolean): Promise<string> {
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd   = new Date(`${date}T23:59:59.999Z`);

  const emailRows = await db
    .select({ productName: productsTable.name, count: sql<number>`cast(count(*) as int)` })
    .from(emailSendsTable)
    .innerJoin(leadsTable, eq(emailSendsTable.leadId, leadsTable.id))
    .leftJoin(productsTable, eq(leadsTable.productId, productsTable.id))
    .where(and(
      eq(emailSendsTable.status, "sent"),
      gte(emailSendsTable.sentAt, dayStart),
      lt(emailSendsTable.sentAt, dayEnd),
      ...(isOwner ? [] : [eq(leadsTable.assignedToUserId, userId)]),
    ))
    .groupBy(productsTable.name);

  const linkedinRows = await db
    .select({ productName: productsTable.name, count: sql<number>`cast(count(*) as int)` })
    .from(leadsTable)
    .leftJoin(productsTable, eq(leadsTable.productId, productsTable.id))
    .where(and(
      eq(leadsTable.lastActionType, "linkedin"),
      gte(leadsTable.lastActionAt, dayStart),
      lt(leadsTable.lastActionAt, dayEnd),
      ...(isOwner ? [] : [eq(leadsTable.assignedToUserId, userId)]),
    ))
    .groupBy(productsTable.name);

  const totalEmails = emailRows.reduce((s, r) => s + r.count, 0);
  const totalLinkedin = linkedinRows.reduce((s, r) => s + r.count, 0);

  if (totalEmails === 0 && totalLinkedin === 0) return "No emails or LinkedIn actions recorded today.";

  const productMap = new Map<string, { emails: number; linkedin: number }>();
  for (const r of emailRows) {
    const k = r.productName ?? "Unassigned";
    productMap.set(k, { emails: (productMap.get(k)?.emails ?? 0) + r.count, linkedin: productMap.get(k)?.linkedin ?? 0 });
  }
  for (const r of linkedinRows) {
    const k = r.productName ?? "Unassigned";
    productMap.set(k, { emails: productMap.get(k)?.emails ?? 0, linkedin: (productMap.get(k)?.linkedin ?? 0) + r.count });
  }

  const lines = Array.from(productMap.entries()).map(([name, c]) => {
    const parts = [];
    if (c.emails > 0) parts.push(`${c.emails} email${c.emails !== 1 ? "s" : ""}`);
    if (c.linkedin > 0) parts.push(`${c.linkedin} LinkedIn`);
    return `${name}: ${parts.join(", ")}`;
  });
  return `Outreach today — ${lines.join("; ")} (totals: ${totalEmails} emails, ${totalLinkedin} LinkedIn).`;
}

const router: IRouter = Router();

router.get("/reflections", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(reflectionsTable)
    .orderBy(desc(reflectionsTable.date));
  res.json(ListReflectionsResponse.parse(toJson(rows)));
});

const COACH_SYSTEM = `You are a direct, no-BS accountability coach for a solo founder trying to hit millions in ARR with zero customers yet. Review his day.

SALES rules: aim the tough love at the BEHAVIOR and the PLAN, never at his identity. Sharp on the miss, specific on the fix, relentless on the next action. Tie the verdict to his stated stakes and today's concrete facts. No praise padding, no AI filler. Themes: the magic is on the other side of discomfort; go big or go home; protect and be selfish with selling hours; if you don't move now the numbers don't happen.

PHYSICAL STANDARDS — non-negotiable. You hold Nadeem to elite standards on appearance and fitness because in sales, YOU are the product:
- First impressions close or kill deals before a word is spoken. He must look sharp ALWAYS — groomed, well-dressed, fit. No exceptions.
- A weak, tired, or dishevelled body signals a weak, tired business. Buyers read the person before they read the pitch.
- Exercise is not optional. It is the engine that powers focus, confidence, and the energy to close. If the reported exercise is vague, minimal, nothing, or anything less than a genuine hard session, call it out brutally. "I went for a walk" is not training. "A bit of stretching" is not training. Silence is failure.
- Scold hard if exercise is missing or weak — no softening, no sympathy. He has no excuse. Champions train when they don't feel like it.

Return ONLY strict JSON: {"verdict":"4-6 sentence tough-love review. Cover: biggest sales/productivity leak AND the physical standard for the day. Name the fix for each. Be specific and harsh where warranted."}`;

router.post("/reflections", async (req, res): Promise<void> => {
  const parsed = CreateReflectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;

  const isOwner = !req.isAuthenticated() || req.user.role === "owner";
  const userId  = req.isAuthenticated() ? req.user.id : "";

  const [dayActivities, goals, outreachLine] = await Promise.all([
    db.select().from(activitiesTable).where(eq(activitiesTable.date, data.date)),
    db.select().from(goalsTable),
    getOutreachLines(data.date, userId, isOwner),
  ]);

  const split = computeFocusSplit(dayActivities);
  const done = dayActivities.filter((a) => a.status === "done").length;
  const alerts = computePaceAlerts(goals, data.date);

  let coachFeedback: string | null = null;
  try {
    const { json } = await runJson(
      COACH_SYSTEM,
      `Date: ${data.date}
Focus Guard: ${split.sellCxPct}% SELL+CX (${split.sellCxMinutes} min selling vs ${split.buildAdminMinutes} min build/admin) — target is 90%.
Activities: ${done}/${dayActivities.length} done.
${outreachLine}
30-day pace: ${alerts.map((a) => `"${a.title}" needs ${a.requiredDailyPace}/day with ${a.daysRemaining} days left (at ${a.currentValue}/${a.targetValue})`).join("; ") || "no 30-day goals tracked"}.
Energy: ${data.energy}/5.
Exercise today: ${data.exercise?.trim() || "NONE REPORTED — no exercise logged today"}
What went well: ${data.wentWell ?? "-"}
What went wrong: ${data.wentWrong ?? "-"}
Improvements he already sees: ${data.improvements ?? "-"}`,
    );
    const verdict = (json as { verdict?: unknown })?.verdict;
    if (typeof verdict === "string" && verdict.trim()) coachFeedback = verdict;
  } catch (err) {
    req.log.error({ err }, "Coach review failed — saving reflection without it");
  }

  const [row] = await db
    .insert(reflectionsTable)
    .values({ ...data, coachFeedback })
    .returning();
  res.status(201).json(CreateReflectionResponse.parse(toJson(row)));

  // Send coach verdict email to authenticated user (fire-and-forget)
  if (coachFeedback && req.isAuthenticated() && req.user.email) {
    const dateLabel = data.date;
    sendEmail({
      to: req.user.email,
      subject: `Sales Manager — your verdict for ${dateLabel}`,
      html: coachPushEmail(coachFeedback, dateLabel),
      text: coachFeedback,
    }).catch(() => {});
  }
});

// ── PATCH /reflections/:date — quick upsert (exercise + energy only, no AI) ──
const PatchReflectionBody = z.object({
  exercise: z.string().nullish(),
  energy: z.number().int().min(1).max(5).optional(),
});

router.patch("/reflections/:date", async (req, res): Promise<void> => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "Invalid date format, expected YYYY-MM-DD" });
    return;
  }
  const parsed = PatchReflectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const set: Record<string, unknown> = {};
  if (parsed.data.exercise !== undefined) set.exercise = parsed.data.exercise?.trim() || null;
  if (parsed.data.energy !== undefined) set.energy = parsed.data.energy;

  const [existing] = await db
    .select()
    .from(reflectionsTable)
    .where(eq(reflectionsTable.date, date));

  if (existing) {
    const [updated] = await db
      .update(reflectionsTable)
      .set(set)
      .where(eq(reflectionsTable.id, existing.id))
      .returning();
    res.json(toJson(updated));
  } else {
    const [created] = await db
      .insert(reflectionsTable)
      .values({ date, energy: parsed.data.energy ?? 3, exercise: (parsed.data.exercise?.trim()) || null })
      .returning();
    res.json(toJson(created));
  }
});

export default router;
