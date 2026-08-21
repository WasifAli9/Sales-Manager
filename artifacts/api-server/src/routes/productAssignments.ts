import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { db, productAssignmentsTable, productsTable } from "@workspace/db";
import { requireOwner } from "../middlewares/requireOwner";

const router = Router();

const AssignBody = z.object({
  productId: z.number().int(),
  userId: z.string(),
});

const PermissionsBody = z.object({
  productId: z.number().int(),
  userId: z.string(),
  permissions: z.array(z.string()).nullable(),
});

// GET /product-assignments?userId=... — list products assigned to a user (with permissions)
router.get("/product-assignments", requireOwner, async (req, res): Promise<void> => {
  const userId = req.query.userId as string | undefined;
  if (!userId) {
    res.status(400).json({ error: "userId query param required" });
    return;
  }
  const rows = await db
    .select({
      productId: productAssignmentsTable.productId,
      permissions: productAssignmentsTable.permissions,
    })
    .from(productAssignmentsTable)
    .where(eq(productAssignmentsTable.userId, userId));
  res.json(rows);
});

// POST /product-assignments — assign a product to a user
router.post("/product-assignments", requireOwner, async (req, res): Promise<void> => {
  const parsed = AssignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { productId, userId } = parsed.data;
  await db
    .insert(productAssignmentsTable)
    .values({ productId, userId })
    .onConflictDoNothing();
  res.status(201).json({ ok: true });
});

// PATCH /product-assignments — update permissions for an existing assignment
router.patch("/product-assignments", requireOwner, async (req, res): Promise<void> => {
  const parsed = PermissionsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { productId, userId, permissions } = parsed.data;
  const result = await db
    .update(productAssignmentsTable)
    .set({ permissions })
    .where(
      and(
        eq(productAssignmentsTable.productId, productId),
        eq(productAssignmentsTable.userId, userId)
      )
    )
    .returning({ id: productAssignmentsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }
  res.json({ ok: true });
});

// DELETE /product-assignments — unassign a product from a user
router.delete("/product-assignments", requireOwner, async (req, res): Promise<void> => {
  const parsed = AssignBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { productId, userId } = parsed.data;
  await db
    .delete(productAssignmentsTable)
    .where(
      and(
        eq(productAssignmentsTable.productId, productId),
        eq(productAssignmentsTable.userId, userId)
      )
    );
  res.sendStatus(204);
});

export default router;
