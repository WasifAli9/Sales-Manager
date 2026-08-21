import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, resourcesTable } from "@workspace/db";
import {
  ListResourcesResponse,
  CreateResourceBody,
  CreateResourceResponse,
  UpdateResourceParams,
  UpdateResourceBody,
  UpdateResourceResponse,
  DeleteResourceParams,
} from "@workspace/api-zod";

import { toJson } from "../lib/serialize";

const router: IRouter = Router();

router.get("/resources", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(resourcesTable)
    .orderBy(resourcesTable.name);
  res.json(ListResourcesResponse.parse(toJson(rows)));
});

router.post("/resources", async (req, res): Promise<void> => {
  const parsed = CreateResourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(resourcesTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(CreateResourceResponse.parse(toJson(row)));
});

router.patch("/resources/:id", async (req, res): Promise<void> => {
  const params = UpdateResourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateResourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(resourcesTable)
    .set(parsed.data)
    .where(eq(resourcesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  res.json(UpdateResourceResponse.parse(toJson(row)));
});

router.delete("/resources/:id", async (req, res): Promise<void> => {
  const params = DeleteResourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(resourcesTable)
    .where(eq(resourcesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
