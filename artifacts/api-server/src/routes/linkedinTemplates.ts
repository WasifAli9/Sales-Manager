import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { linkedinTemplatesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// GET /api/linkedin-templates
router.get("/linkedin-templates", async (_req: Request, res: Response) => {
  const rows = await db.select().from(linkedinTemplatesTable).orderBy(linkedinTemplatesTable.createdAt);
  res.json(rows);
});

// POST /api/linkedin-templates
router.post("/linkedin-templates", async (req: Request, res: Response) => {
  const { name, type, body } = req.body as { name?: string; type?: string; body?: string };
  if (!name || !body) { res.status(400).json({ error: "name and body required" }); return; }
  const [row] = await db
    .insert(linkedinTemplatesTable)
    .values({ name, type: type ?? "message", body })
    .returning();
  res.status(201).json(row);
});

// PUT /api/linkedin-templates/:id
router.put("/linkedin-templates/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  const { name, type, body } = req.body as { name?: string; type?: string; body?: string };
  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (type !== undefined) patch.type = type;
  if (body !== undefined) patch.body = body;
  const [row] = await db
    .update(linkedinTemplatesTable)
    .set(patch)
    .where(eq(linkedinTemplatesTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json(row);
});

// DELETE /api/linkedin-templates/:id
router.delete("/linkedin-templates/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  await db.delete(linkedinTemplatesTable).where(eq(linkedinTemplatesTable.id, id));
  res.status(204).end();
});

export default router;
