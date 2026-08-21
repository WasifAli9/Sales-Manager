import { Router, type IRouter } from "express";
import { and, desc, eq, type SQL } from "drizzle-orm";
import {
  db,
  aiAnalysesTable,
  productsTable,
  platformStatesTable,
} from "@workspace/db";
import {
  ListAnalysesQueryParams,
  ListAnalysesResponse,
  RunStrategistParams,
  RunStrategistBody,
  RunStrategistResponse,
} from "@workspace/api-zod";
import { runStrategistAnalysis, type AnalysisKind } from "../lib/strategist";

import { toJson } from "../lib/serialize";

const router: IRouter = Router();

router.get("/analyses", async (req, res): Promise<void> => {
  const query = ListAnalysesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const conditions: SQL[] = [];
  if (query.data.productId !== undefined)
    conditions.push(eq(aiAnalysesTable.productId, query.data.productId));
  if (query.data.kind !== undefined)
    conditions.push(eq(aiAnalysesTable.kind, query.data.kind));
  const rows = await db
    .select()
    .from(aiAnalysesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(aiAnalysesTable.createdAt));
  res.json(ListAnalysesResponse.parse(toJson(rows)));
});

router.post("/products/:id/strategist", async (req, res): Promise<void> => {
  const params = RunStrategistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = RunStrategistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id));
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const states = await db
    .select()
    .from(platformStatesTable)
    .where(eq(platformStatesTable.productId, product.id));

  const { content, modelUsed, grounded } = await runStrategistAnalysis(
    parsed.data.kind as AnalysisKind,
    product,
    states,
    parsed.data.pastedResearch,
  );

  // Replace the cached analysis of this kind for this product
  await db
    .delete(aiAnalysesTable)
    .where(
      and(
        eq(aiAnalysesTable.productId, product.id),
        eq(aiAnalysesTable.kind, parsed.data.kind),
      ),
    );
  const [row] = await db
    .insert(aiAnalysesTable)
    .values({
      productId: product.id,
      kind: parsed.data.kind,
      content,
      modelUsed,
      grounded,
    })
    .returning();

  res.status(201).json(RunStrategistResponse.parse(toJson(row)));
});

export default router;
