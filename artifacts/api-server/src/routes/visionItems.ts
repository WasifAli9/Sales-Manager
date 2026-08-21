import { Router, type IRouter } from "express";
import { eq, and, or, isNull } from "drizzle-orm";
import { db, visionItemsTable } from "@workspace/db";
import {
  ListVisionItemsResponse,
  CreateVisionItemBody,
  CreateVisionItemResponse,
  UpdateVisionItemParams,
  UpdateVisionItemBody,
  UpdateVisionItemResponse,
  DeleteVisionItemParams,
} from "@workspace/api-zod";
import { requireOwner } from "../middlewares/requireOwner";
import { toJson } from "../lib/serialize";

const router: IRouter = Router();

/** Vision items are private per user.
 *  Owner sees items where userId IS NULL (legacy) OR userId = owner's id.
 *  Members see only items where userId = their id.
 */
router.get("/vision-items", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const uid = req.user.id;
  const isOwner = req.user.role === "owner";

  const rows = await db
    .select()
    .from(visionItemsTable)
    .where(
      isOwner
        ? or(isNull(visionItemsTable.userId), eq(visionItemsTable.userId, uid))
        : eq(visionItemsTable.userId, uid)
    )
    .orderBy(visionItemsTable.sortOrder);
  res.json(ListVisionItemsResponse.parse(toJson(rows)));
});

// Vision items are NOT shared — members can manage their own board freely.
router.post("/vision-items", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const parsed = CreateVisionItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(visionItemsTable)
    .values({ ...parsed.data, userId: req.user.id })
    .returning();
  res.status(201).json(CreateVisionItemResponse.parse(toJson(row)));
});

router.patch("/vision-items/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const params = UpdateVisionItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateVisionItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const uid = req.user.id;
  const isOwner = req.user.role === "owner";
  const [row] = await db
    .update(visionItemsTable)
    .set(parsed.data)
    .where(
      and(
        eq(visionItemsTable.id, params.data.id),
        isOwner
          ? or(isNull(visionItemsTable.userId), eq(visionItemsTable.userId, uid))
          : eq(visionItemsTable.userId, uid)
      )
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Vision item not found" });
    return;
  }
  res.json(UpdateVisionItemResponse.parse(toJson(row)));
});

router.delete("/vision-items/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const params = DeleteVisionItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const uid = req.user.id;
  const isOwner = req.user.role === "owner";
  const [row] = await db
    .delete(visionItemsTable)
    .where(
      and(
        eq(visionItemsTable.id, params.data.id),
        isOwner
          ? or(isNull(visionItemsTable.userId), eq(visionItemsTable.userId, uid))
          : eq(visionItemsTable.userId, uid)
      )
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Vision item not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
