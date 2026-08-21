import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { emailTemplatesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// GET /api/email-templates
router.get("/email-templates", async (_req: Request, res: Response) => {
  const templates = await db
    .select()
    .from(emailTemplatesTable)
    .orderBy(emailTemplatesTable.createdAt);
  res.json(templates);
});

// POST /api/email-templates
router.post("/email-templates", async (req: Request, res: Response) => {
  const { name, productId, subject, body, isFollowUp, followUpDelayDays } = req.body as {
    name?: string;
    productId?: number | null;
    subject?: string;
    body?: string;
    isFollowUp?: boolean;
    followUpDelayDays?: number | null;
  };

  if (!name || !subject || !body) {
    res.status(400).json({ error: "name, subject and body are required" });
    return;
  }

  const [template] = await db
    .insert(emailTemplatesTable)
    .values({
      name,
      productId: productId ?? null,
      subject,
      body,
      isFollowUp: isFollowUp ?? false,
      followUpDelayDays: followUpDelayDays ?? null,
    })
    .returning();

  res.status(201).json(template);
});

// PATCH /api/email-templates/:id
router.patch("/email-templates/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }

  const { name, productId, subject, body, isFollowUp, followUpDelayDays } = req.body as {
    name?: string;
    productId?: number | null;
    subject?: string;
    body?: string;
    isFollowUp?: boolean;
    followUpDelayDays?: number | null;
  };

  const patch: Partial<typeof emailTemplatesTable.$inferInsert> = {};
  if (name !== undefined) patch.name = name;
  if (productId !== undefined) patch.productId = productId ?? null;
  if (subject !== undefined) patch.subject = subject;
  if (body !== undefined) patch.body = body;
  if (isFollowUp !== undefined) patch.isFollowUp = isFollowUp;
  if (followUpDelayDays !== undefined) patch.followUpDelayDays = followUpDelayDays ?? null;

  const [updated] = await db
    .update(emailTemplatesTable)
    .set(patch)
    .where(eq(emailTemplatesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "not found" }); return; }
  res.json(updated);
});

// DELETE /api/email-templates/:id
router.delete("/email-templates/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  await db.delete(emailTemplatesTable).where(eq(emailTemplatesTable.id, id));
  res.status(204).end();
});

export default router;
