import { Router, type IRouter, type Request, type Response } from "express";
import { eq, asc } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { revenueLinesTable } from "@workspace/db/schema";
import { requireOwner } from "../middlewares/requireOwner";
import { toJson } from "../lib/serialize";

const router: IRouter = Router();

// ── GET /revenue-lines?productId=N ────────────────────────────────────────
router.get("/revenue-lines", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const productId = parseInt(String(req.query.productId), 10);
  if (isNaN(productId)) { res.status(400).json({ error: "productId required" }); return; }
  const rows = await db
    .select()
    .from(revenueLinesTable)
    .where(eq(revenueLinesTable.productId, productId))
    .orderBy(asc(revenueLinesTable.sortOrder), asc(revenueLinesTable.createdAt));
  res.json(toJson(rows));
});

// ── POST /revenue-lines (owner only) ──────────────────────────────────────
const CreateBody = z.object({
  productId: z.int(),
  name: z.string().min(1),
  description: z.string().optional(),
  unitValue: z.number().min(0).optional().default(0),
});

router.post("/revenue-lines", requireOwner, async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }
  const { productId, name, description, unitValue } = parsed.data;
  const [row] = await db
    .insert(revenueLinesTable)
    .values({ productId, name, description: description ?? null, unitValue: String(unitValue) })
    .returning();
  res.status(201).json(toJson(row));
});

// ── PATCH /revenue-lines/:id (owner only) ─────────────────────────────────
const UpdateBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullish(),
  unitValue: z.number().min(0).optional(),
});

router.patch("/revenue-lines/:id", requireOwner, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }); return; }
  const { name, description, unitValue } = parsed.data;
  const set: Record<string, unknown> = {};
  if (name !== undefined) set.name = name;
  if (description !== undefined) set.description = description ?? null;
  if (unitValue !== undefined) set.unitValue = String(unitValue);
  const [row] = await db.update(revenueLinesTable).set(set).where(eq(revenueLinesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toJson(row));
});

// ── DELETE /revenue-lines/:id (owner only) ────────────────────────────────
router.delete("/revenue-lines/:id", requireOwner, async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(revenueLinesTable).where(eq(revenueLinesTable.id, id));
  res.sendStatus(204);
});

export default router;
