import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, platformStatesTable } from "@workspace/db";
import {
  ListPlatformStatesQueryParams,
  ListPlatformStatesResponse,
  CreatePlatformStateBody,
  CreatePlatformStateResponse,
  UpdatePlatformStateParams,
  UpdatePlatformStateBody,
  UpdatePlatformStateResponse,
  DeletePlatformStateParams,
} from "@workspace/api-zod";

import { toJson } from "../lib/serialize";

const router: IRouter = Router();

router.get("/platform-states", async (req, res): Promise<void> => {
  const query = ListPlatformStatesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(platformStatesTable)
    .where(
      query.data.productId !== undefined
        ? eq(platformStatesTable.productId, query.data.productId)
        : undefined,
    );
  res.json(ListPlatformStatesResponse.parse(toJson(rows)));
});

router.post("/platform-states", async (req, res): Promise<void> => {
  const parsed = CreatePlatformStateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(platformStatesTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(CreatePlatformStateResponse.parse(toJson(row)));
});

router.patch("/platform-states/:id", async (req, res): Promise<void> => {
  const params = UpdatePlatformStateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePlatformStateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(platformStatesTable)
    .set({ ...parsed.data, lastActivityAt: new Date() })
    .where(eq(platformStatesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Platform state not found" });
    return;
  }
  res.json(UpdatePlatformStateResponse.parse(toJson(row)));
});

router.delete("/platform-states/:id", async (req, res): Promise<void> => {
  const params = DeletePlatformStateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(platformStatesTable)
    .where(eq(platformStatesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Platform state not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
