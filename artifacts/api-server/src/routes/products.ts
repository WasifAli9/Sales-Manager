import { Router, type IRouter } from "express";
import { eq, asc, ne, and, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { db, productsTable, productAssignmentsTable } from "@workspace/db";
import { requireOwner } from "../middlewares/requireOwner";
import {
  ListProductsResponse,
  CreateProductBody,
  CreateProductResponse,
  GetProductParams,
  GetProductResponse,
  UpdateProductParams,
  UpdateProductBody,
  UpdateProductResponse,
  DeleteProductParams,
} from "@workspace/api-zod";
import { runJson } from "../lib/ai";
import { scrapeWebsite } from "../lib/webscraper";
import { logger } from "../lib/logger";
import { toJson } from "../lib/serialize";
import { canAccessProduct } from "../lib/productAccess";

const router: IRouter = Router();

router.get("/products", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }

  // Members see only products assigned to them (active only)
  if (req.user.role !== "owner") {
    const assignments = await db
      .select({ productId: productAssignmentsTable.productId })
      .from(productAssignmentsTable)
      .where(eq(productAssignmentsTable.userId, req.user.id));
    const ids = assignments.map(a => a.productId);
    if (!ids.length) { res.json(ListProductsResponse.parse([])); return; }
    const rows = await db
      .select()
      .from(productsTable)
      .where(and(inArray(productsTable.id, ids), ne(productsTable.status, "inactive")))
      .orderBy(asc(productsTable.sortOrder), asc(productsTable.createdAt));
    res.json(ListProductsResponse.parse(toJson(rows)));
    return;
  }

  // Owners: exclude inactive by default unless ?includeInactive=true
  const includeInactive = req.query.includeInactive === "true";
  const rows = await db
    .select()
    .from(productsTable)
    .where(includeInactive ? undefined : ne(productsTable.status, "inactive"))
    .orderBy(asc(productsTable.sortOrder), asc(productsTable.createdAt));
  res.json(ListProductsResponse.parse(toJson(rows)));
});

const ReorderBody = z.object({
  ids: z.array(z.number()).min(1),
});

router.post("/products/reorder", requireOwner, async (req, res): Promise<void> => {
  const parsed = ReorderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Update each product's sortOrder to match its position in the array
  await Promise.all(
    parsed.data.ids.map((id, idx) =>
      db.update(productsTable).set({ sortOrder: idx }).where(eq(productsTable.id, id))
    )
  );
  res.json({ ok: true });
});

router.post("/products", requireOwner, async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(productsTable).values(parsed.data).returning();
  res.status(201).json(CreateProductResponse.parse(toJson(row)));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(GetProductResponse.parse(toJson(row)));
});

router.get("/products/:id/email-sequence-settings", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Not authenticated" }); return; }
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }
  if (!await canAccessProduct(req, id)) {
    res.status(403).json({ error: "You do not have access to this product" });
    return;
  }
  const [product] = await db
    .select({ id: productsTable.id, emailSequenceInstruction: productsTable.emailSequenceInstruction })
    .from(productsTable)
    .where(eq(productsTable.id, id))
    .limit(1);
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json({ instruction: product.emailSequenceInstruction ?? "" });
});

router.patch("/products/:id/email-sequence-settings", requireOwner, async (req, res): Promise<void> => {
  const id = Number.parseInt(String(req.params.id), 10);
  const instruction = typeof req.body?.instruction === "string" ? req.body.instruction.trim() : "";
  if (!Number.isInteger(id) || id <= 0 || instruction.length > 10000) {
    res.status(400).json({ error: "Instruction must be 10,000 characters or fewer" });
    return;
  }
  const [updated] = await db
    .update(productsTable)
    .set({ emailSequenceInstruction: instruction || null })
    .where(eq(productsTable.id, id))
    .returning({ instruction: productsTable.emailSequenceInstruction });
  if (!updated) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json({ instruction: updated.instruction ?? "" });
});

router.patch("/products/:id", requireOwner, async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(productsTable)
    .set(parsed.data)
    .where(eq(productsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(UpdateProductResponse.parse(toJson(row)));
});

const ANALYZE_SYSTEM = `You are a B2B SaaS market analyst. You will receive scraped text from a product website. Extract and return ONLY a JSON object with these exact keys:

{
  "name": "product name (short, clean)",
  "tagline": "punchy one-liner value statement, max 12 words",
  "description": "clear 2-3 sentence product description — what it does, for whom, and why it matters",
  "targetMarket": "specific industry or segment (e.g. 'Construction project managers', 'HR teams at 50-500 person companies')",
  "icp": "ideal customer profile — job title, company size, pain point they're solving, trigger event that makes them buy",
  "valueProp": "the single core value proposition — the before/after transformation the product delivers",
  "keyFeatures": ["feature 1", "feature 2", "feature 3", "feature 4", "feature 5"],
  "pricingModel": "pricing structure if mentioned, otherwise 'Not publicly listed'",
  "competitorLandscape": "2-3 sentence competitive context — who they compete with and how they differentiate",
  "linkedinFilter": "A ready-to-use LinkedIn Sales Navigator filter description a salesperson can apply directly. Format as a structured list of filter criteria, for example: 'Job Title: [VP of Sales, Head of Revenue, Chief Revenue Officer] | Seniority: [Director, VP, C-Level] | Company Size: [51-200, 201-500] | Industry: [Software, SaaS, Technology] | Geography: [United States, United Kingdom]'. Base it on the ICP and target market. Be specific and actionable."
}

Return ONLY valid JSON. No markdown, no explanation. If a field cannot be determined from the website, use a short 'Not found on website' string for strings or an empty array for arrays.`;

router.post("/products/:id/analyze", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, id));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const url = product.websiteUrl;
  if (!url) {
    res.status(400).json({ error: "Product has no website URL. Update it first." });
    return;
  }

  // Scrape
  let pageText: string;
  try {
    pageText = await scrapeWebsite(url);
  } catch (err) {
    logger.error({ err, url }, "Website scrape failed");
    res.status(422).json({ error: `Could not fetch ${url} — check the URL is reachable.` });
    return;
  }

  // Analyse
  let intel: Record<string, unknown>;
  try {
    const { json } = await runJson(
      ANALYZE_SYSTEM,
      `Website URL: ${url}\n\nScraped content:\n${pageText}`,
    );
    intel = json as Record<string, unknown>;
  } catch (err) {
    logger.error({ err }, "Product website analysis AI call failed");
    res.status(500).json({ error: "AI analysis failed — try again." });
    return;
  }

  const getString = (key: string): string | null => {
    const v = intel[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const updates = {
    name:                  getString("name")               ?? product.name,
    tagline:               getString("tagline")            ?? product.tagline,
    description:           getString("description")        ?? product.description,
    targetMarket:          getString("targetMarket")       ?? product.targetMarket,
    icp:                   getString("icp"),
    valueProp:             getString("valueProp"),
    keyFeatures:           Array.isArray(intel.keyFeatures)
                             ? JSON.stringify(intel.keyFeatures)
                             : getString("keyFeatures"),
    pricingModel:          getString("pricingModel"),
    competitorLandscape:   getString("competitorLandscape"),
    linkedinFilter:        getString("linkedinFilter"),
    aiSummary:             getString("description"),       // reuse description as summary
    websiteAnalyzedAt:     new Date(),
  };

  const [updated] = await db
    .update(productsTable)
    .set(updates)
    .where(eq(productsTable.id, id))
    .returning();

  res.json({ product: toJson(updated) });
});

router.delete("/products/:id", requireOwner, async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
