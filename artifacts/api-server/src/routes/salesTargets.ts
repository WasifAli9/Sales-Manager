import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, salesTargetsTable, productsTable } from "@workspace/db";
import { revenueLinesTable } from "@workspace/db/schema";
import { toJson } from "../lib/serialize";
import { buildTargetWorkbook } from "../lib/excel";
import { sendEmail, salesFromEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { requireOwnerOrAdmin } from "../middlewares/requireOwnerOrAdmin";

const router = Router();

// ── helpers ────────────────────────────────────────────────────────────────

async function getTargetRows(productId: number, year: number) {
  return db
    .select()
    .from(salesTargetsTable)
    .where(and(eq(salesTargetsTable.productId, productId), eq(salesTargetsTable.year, year)))
    .orderBy(salesTargetsTable.revenueLine, salesTargetsTable.month);
}

function buildExcelRows(targets: (typeof salesTargetsTable.$inferSelect)[]) {
  // Group by revenue line
  const byLine = new Map<string, { months: (number | null)[]; actuals: (number | null)[] }>();
  for (const t of targets) {
    if (!byLine.has(t.revenueLine)) {
      byLine.set(t.revenueLine, { months: Array(12).fill(null), actuals: Array(12).fill(null) });
    }
    const row = byLine.get(t.revenueLine)!;
    row.months[t.month - 1] = parseFloat(t.targetAmount as string) || 0;
    row.actuals[t.month - 1] = t.actualAmount != null ? parseFloat(t.actualAmount as string) : null;
  }
  return Array.from(byLine.entries()).map(([revenueLine, { months, actuals }]) => ({
    revenueLine,
    months,
    actuals,
  }));
}

// ── GET /sales-targets ─────────────────────────────────────────────────────
router.get("/sales-targets", async (req, res): Promise<void> => {
  const productId = parseInt(req.query.productId as string, 10);
  const year = parseInt(req.query.year as string, 10);
  if (isNaN(productId) || isNaN(year)) {
    res.status(400).json({ error: "productId and year are required integers" });
    return;
  }
  const rows = await getTargetRows(productId, year);
  res.json(rows.map(toJson));
});

// ── POST /sales-targets  (upsert) ──────────────────────────────────────────
const UpsertBody = z.object({
  // New-style: link to a revenue_lines definition
  revenueLineId: z.int().optional(),
  unitVolume: z.number().min(0).optional(),
  // Legacy fields (still used for old-style direct-amount rows)
  productId: z.int().optional(),
  year: z.int().min(2000).max(2100),
  month: z.int().min(1).max(12),
  revenueLine: z.string().optional(),
  targetAmount: z.number().min(0).optional().default(0),
  actualAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
});

router.post("/sales-targets", requireOwnerOrAdmin, async (req, res): Promise<void> => {
  const parsed = UpsertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { revenueLineId, unitVolume, productId, year, month, revenueLine, actualAmount, notes } = parsed.data;
  let { targetAmount } = parsed.data;

  // New-style: revenue_line_id + unit_volume → compute targetAmount
  if (revenueLineId != null && unitVolume != null) {
    const [rl] = await db.select().from(revenueLinesTable).where(eq(revenueLinesTable.id, revenueLineId));
    if (!rl) { res.status(404).json({ error: "Revenue line not found" }); return; }
    targetAmount = unitVolume * parseFloat(rl.unitValue as string);

    const [row] = await db
      .insert(salesTargetsTable)
      .values({
        productId: rl.productId,
        year,
        month,
        revenueLine: rl.name,
        revenueLineId,
        unitVolume: String(unitVolume),
        targetAmount: String(targetAmount),
        actualAmount: actualAmount != null ? String(actualAmount) : null,
        notes: notes ?? null,
      })
      .onConflictDoUpdate({
        target: [salesTargetsTable.revenueLineId, salesTargetsTable.year, salesTargetsTable.month],
        set: {
          unitVolume: String(unitVolume),
          targetAmount: String(targetAmount),
          actualAmount: actualAmount != null ? String(actualAmount) : null,
          notes: notes ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    res.json(toJson(row));
    return;
  }

  // Legacy-style: direct amount
  if (!productId || !revenueLine) {
    res.status(400).json({ error: "productId and revenueLine required for legacy entries" });
    return;
  }

  const [row] = await db
    .insert(salesTargetsTable)
    .values({
      productId,
      year,
      month,
      revenueLine,
      targetAmount: String(targetAmount),
      actualAmount: actualAmount != null ? String(actualAmount) : null,
      notes: notes ?? null,
    })
    .onConflictDoUpdate({
      target: [
        salesTargetsTable.productId,
        salesTargetsTable.year,
        salesTargetsTable.month,
        salesTargetsTable.revenueLine,
      ],
      set: {
        targetAmount: String(targetAmount),
        actualAmount: actualAmount != null ? String(actualAmount) : null,
        notes: notes ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json(toJson(row));
});

// ── PATCH /sales-targets/:id ───────────────────────────────────────────────
const UpdateBody = z.object({
  targetAmount: z.number().min(0).optional(),
  actualAmount: z.number().min(0).nullish(),
  notes: z.string().nullish(),
  unitVolume: z.number().min(0).optional(),
});

router.patch("/sales-targets/:id", requireOwnerOrAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { actualAmount, notes, unitVolume } = parsed.data;
  let { targetAmount } = parsed.data;
  const set: Record<string, unknown> = { updatedAt: new Date() };

  // If updating unit volume, recompute targetAmount from the revenue line's unit value
  if (unitVolume !== undefined) {
    const [existing] = await db.select().from(salesTargetsTable).where(eq(salesTargetsTable.id, id));
    if (existing?.revenueLineId) {
      const [rl] = await db.select().from(revenueLinesTable).where(eq(revenueLinesTable.id, existing.revenueLineId));
      if (rl) targetAmount = unitVolume * parseFloat(rl.unitValue as string);
    }
    set.unitVolume = String(unitVolume);
  }

  if (targetAmount !== undefined) set.targetAmount = String(targetAmount);
  if (actualAmount !== undefined) set.actualAmount = actualAmount != null ? String(actualAmount) : null;
  if (notes !== undefined) set.notes = notes ?? null;

  const [row] = await db
    .update(salesTargetsTable)
    .set(set)
    .where(eq(salesTargetsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toJson(row));
});

// ── DELETE /sales-targets/:id ──────────────────────────────────────────────
router.delete("/sales-targets/:id", requireOwnerOrAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(salesTargetsTable).where(eq(salesTargetsTable.id, id));
  res.sendStatus(204);
});

// ── GET /sales-targets/export ─────────────────────────────────────────────
router.get("/sales-targets/export", async (req, res): Promise<void> => {
  const productId = parseInt(req.query.productId as string, 10);
  const year = parseInt(req.query.year as string, 10);
  if (isNaN(productId) || isNaN(year)) {
    res.status(400).json({ error: "productId and year are required" });
    return;
  }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  const targets = await getTargetRows(productId, year);
  const rows = buildExcelRows(targets);

  const buf = await buildTargetWorkbook({
    productName: product?.name ?? `Product ${productId}`,
    year,
    rows,
  });

  const filename = `${(product?.name ?? "targets").replace(/[^a-z0-9]/gi, "_")}_${year}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
});

// ── POST /sales-targets/email ─────────────────────────────────────────────
const EmailBody = z.object({
  productId: z.int(),
  year: z.int(),
  recipientEmail: z.email(),
});

router.post("/sales-targets/email", async (req, res): Promise<void> => {
  const parsed = EmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { productId, year, recipientEmail } = parsed.data;

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  const targets = await getTargetRows(productId, year);
  const rows = buildExcelRows(targets);

  const buf = await buildTargetWorkbook({
    productName: product?.name ?? `Product ${productId}`,
    year,
    rows,
  });

  const filename = `${(product?.name ?? "targets").replace(/[^a-z0-9]/gi, "_")}_${year}.xlsx`;

  const result = await sendEmail({
    to: recipientEmail,
    from: salesFromEmail(),
    subject: `Sales Targets — ${product?.name ?? "Product"} ${year}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0B1220;color:#e2e8f0;border-radius:16px">
        <h1 style="font-size:22px;font-weight:800;margin:0 0 8px">Sales Targets ${year}</h1>
        <p style="color:#94a3b8;margin:0 0 16px">${product?.name ?? "Product"} — attached as Excel spreadsheet.</p>
        <p style="color:#475569;font-size:12px;margin:0">Generated by Sales Manager · ${new Date().toLocaleDateString()}</p>
      </div>
    `,
    attachments: [
      {
        filename,
        content: buf.toString("base64"),
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
  });

  if (!result.ok) {
    logger.error({ productId, year, recipientEmail, error: result.error }, "Sales targets email failed");
    res.status(502).json({ error: `Email could not be sent: ${result.error}` });
    return;
  }

  logger.info({ productId, year, recipientEmail, id: result.id }, "Sales targets email sent");
  res.json({ success: true });
});

export default router;
