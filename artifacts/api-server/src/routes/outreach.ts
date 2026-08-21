import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { emailSendsTable, leadsTable, productsTable } from "@workspace/db/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";

const router: IRouter = Router();

export interface OutreachProductRow {
  productId: number | null;
  productName: string | null;
  emailsSent: number;
  linkedinActions: number;
}

export interface OutreachTodaySummary {
  date: string;
  byProduct: OutreachProductRow[];
  totals: { emailsSent: number; linkedinActions: number };
}

/**
 * GET /api/outreach/today?date=YYYY-MM-DD
 *
 * Returns today's email sends and LinkedIn lead actions grouped by product.
 * Scoped to the current user:
 *   owner  → all leads / all email sends
 *   member → only leads assigned to them
 */
router.get("/outreach/today", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }

  const rawDate = (req.query.date as string | undefined) ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }

  const dayStart = new Date(`${rawDate}T00:00:00.000Z`);
  const dayEnd   = new Date(`${rawDate}T23:59:59.999Z`);

  const isMember = req.user.role !== "owner";
  const userId   = req.user.id;

  // ── Emails sent today ──────────────────────────────────────────────────
  const emailRows = await db
    .select({
      productId:   leadsTable.productId,
      productName: productsTable.name,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(emailSendsTable)
    .innerJoin(leadsTable, eq(emailSendsTable.leadId, leadsTable.id))
    .leftJoin(productsTable, eq(leadsTable.productId, productsTable.id))
    .where(
      and(
        eq(emailSendsTable.status, "sent"),
        gte(emailSendsTable.sentAt, dayStart),
        lt(emailSendsTable.sentAt, dayEnd),
        ...(isMember ? [eq(leadsTable.assignedToUserId, userId)] : []),
      ),
    )
    .groupBy(leadsTable.productId, productsTable.name);

  // ── LinkedIn actions today ─────────────────────────────────────────────
  const linkedinRows = await db
    .select({
      productId:   leadsTable.productId,
      productName: productsTable.name,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(leadsTable)
    .leftJoin(productsTable, eq(leadsTable.productId, productsTable.id))
    .where(
      and(
        eq(leadsTable.lastActionType, "linkedin"),
        gte(leadsTable.lastActionAt, dayStart),
        lt(leadsTable.lastActionAt, dayEnd),
        ...(isMember ? [eq(leadsTable.assignedToUserId, userId)] : []),
      ),
    )
    .groupBy(leadsTable.productId, productsTable.name);

  // ── Merge into one row per product ────────────────────────────────────
  const map = new Map<string, OutreachProductRow>();

  const key = (pid: number | null) => String(pid ?? "null");

  for (const r of emailRows) {
    const k = key(r.productId);
    const existing = map.get(k);
    if (existing) { existing.emailsSent += r.count; }
    else map.set(k, { productId: r.productId, productName: r.productName ?? null, emailsSent: r.count, linkedinActions: 0 });
  }
  for (const r of linkedinRows) {
    const k = key(r.productId);
    const existing = map.get(k);
    if (existing) { existing.linkedinActions += r.count; }
    else map.set(k, { productId: r.productId, productName: r.productName ?? null, emailsSent: 0, linkedinActions: r.count });
  }

  const byProduct = Array.from(map.values()).sort((a, b) => {
    // Named products first, then unassigned
    if (a.productName && !b.productName) return -1;
    if (!a.productName && b.productName) return 1;
    return (a.productName ?? "").localeCompare(b.productName ?? "");
  });

  const totals = byProduct.reduce(
    (acc, r) => ({ emailsSent: acc.emailsSent + r.emailsSent, linkedinActions: acc.linkedinActions + r.linkedinActions }),
    { emailsSent: 0, linkedinActions: 0 },
  );

  const summary: OutreachTodaySummary = { date: rawDate, byProduct, totals };
  res.json(summary);
});

export default router;
