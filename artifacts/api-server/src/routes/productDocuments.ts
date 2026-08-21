import { Router, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import {
  db,
  aiAnalysesTable,
  productDocumentsTable,
  productsTable,
} from "@workspace/db";
import {
  CreateProductStrategyDocumentParams,
  CreateProductStrategyDocumentResponse,
} from "@workspace/api-zod";
import { toJson } from "../lib/serialize";
import { canAccessProduct } from "../lib/productAccess";
import {
  buildStrategyDocument,
  getMissingStrategistAnalyses,
} from "../lib/strategyDocument";

const router = Router();

async function requireProductAccess(
  req: Request,
  res: Response,
  productId: number,
): Promise<boolean> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }

  if (!(await canAccessProduct(req, productId))) {
    res.status(403).json({ error: "You do not have access to this product" });
    return false;
  }

  return true;
}

router.post("/products/:id/strategy-document", async (req, res): Promise<void> => {
  const params = CreateProductStrategyDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const productId = params.data.id;
  if (!(await requireProductAccess(req, res, productId))) return;

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId));
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const analyses = await db
    .select({
      id: aiAnalysesTable.id,
      kind: aiAnalysesTable.kind,
      content: aiAnalysesTable.content,
      grounded: aiAnalysesTable.grounded,
      createdAt: aiAnalysesTable.createdAt,
    })
    .from(aiAnalysesTable)
    .where(eq(aiAnalysesTable.productId, productId))
    .orderBy(desc(aiAnalysesTable.createdAt), desc(aiAnalysesTable.id));

  const missingKinds = getMissingStrategistAnalyses(analyses);
  if (missingKinds.length) {
    res.status(400).json({
      error: "Complete all five Strategist analyses before creating a strategy document",
      missingKinds,
    });
    return;
  }

  const textContent = buildStrategyDocument(product, analyses);
  const [document] = await db
    .insert(productDocumentsTable)
    .values({
      productId,
      name: "Strategist Sales Strategy",
      textContent,
      storageKey: null,
      mimeType: "text/plain",
      fileSizeBytes: Buffer.byteLength(textContent, "utf8"),
    })
    .returning();

  res.status(201).json(CreateProductStrategyDocumentResponse.parse(toJson(document)));
});

router.get("/products/:id/documents", async (req, res): Promise<void> => {
  const productId = parseInt(req.params.id as string, 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await requireProductAccess(req, res, productId))) return;

  const rows = await db
    .select()
    .from(productDocumentsTable)
    .where(eq(productDocumentsTable.productId, productId))
    .orderBy(productDocumentsTable.createdAt);

  res.json(rows.map(toJson));
});

router.post("/products/:id/documents", async (req, res): Promise<void> => {
  const productId = parseInt(req.params.id as string, 10);
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await requireProductAccess(req, res, productId))) return;

  const { name, textContent, storageKey, mimeType, fileSizeBytes } = req.body as Record<string, string | number | undefined>;
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" }); return;
  }

  const [row] = await db
    .insert(productDocumentsTable)
    .values({
      productId,
      name: (name as string).trim(),
      textContent: typeof textContent === "string" ? textContent : null,
      storageKey: typeof storageKey === "string" ? storageKey : null,
      mimeType: typeof mimeType === "string" ? mimeType : null,
      fileSizeBytes: typeof fileSizeBytes === "number" ? fileSizeBytes : null,
    })
    .returning();

  res.status(201).json(toJson(row));
});

router.delete("/products/:productId/documents/:docId", async (req, res): Promise<void> => {
  const productId = parseInt(req.params.productId as string, 10);
  const docId = parseInt(req.params.docId as string, 10);
  if (isNaN(productId) || isNaN(docId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await requireProductAccess(req, res, productId))) return;

  const [row] = await db
    .delete(productDocumentsTable)
    .where(and(eq(productDocumentsTable.id, docId), eq(productDocumentsTable.productId, productId)))
    .returning();

  if (!row) { res.status(404).json({ error: "Document not found" }); return; }
  res.sendStatus(204);
});

export default router;
