/**
 * Saved email sections + render preview API.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { emailSavedSectionsTable } from "@workspace/db/schema";
import { canAccessProduct } from "../lib/productAccess";
import { loadBrandForProduct } from "../lib/emailDesignContext";
import { renderEmailDesign } from "../lib/emailDesignRender";
import { appPublicUrl } from "../lib/appUrl";
import {
  coerceSections,
  renderSections,
  renderSectionsBodyFragment,
  type EmailSection,
} from "../lib/emailSectionRender";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  return true;
}

function parseId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const sectionSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "heading", "image", "button", "divider", "spacer", "header", "footer", "imageText", "html"]),
  visible: z.boolean(),
  savedSectionId: z.number().nullable().optional(),
  content: z.record(z.string(), z.unknown()),
  style: z.record(z.string(), z.unknown()),
});

const saveSectionSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional().nullable(),
  category: z.string().trim().max(80).optional(),
  tags: z.array(z.string()).optional(),
  sections: z.array(sectionSchema).min(1),
});

async function renderStepContent(
  sections: EmailSection[] | null,
  legacyBody: string,
  productId: number | null,
  templateId?: number | null,
): Promise<string> {
  const brand = await loadBrandForProduct(productId ?? undefined);
  const origin = appPublicUrl();
  const contentHtml = sections?.length
    ? renderSectionsBodyFragment(sections, brand, origin)
    : legacyBody;

  if (!templateId || !productId) return contentHtml;

  const { emailDesignTemplatesTable } = await import("@workspace/db/schema");
  const [template] = await db
    .select()
    .from(emailDesignTemplatesTable)
    .where(and(eq(emailDesignTemplatesTable.id, templateId), eq(emailDesignTemplatesTable.productId, productId)))
    .limit(1);

  if (!template?.isActive) return contentHtml;

  return renderEmailDesign({
    htmlShell: template.htmlShell,
    bodyHtml: contentHtml,
    brand,
    injectLogoWhenNoTemplate: false,
  });
}

// GET /api/products/:productId/email-sections?q=&category=
router.get("/products/:productId/email-sections", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";

  let query = db
    .select()
    .from(emailSavedSectionsTable)
    .where(eq(emailSavedSectionsTable.productId, productId))
    .orderBy(desc(emailSavedSectionsTable.updatedAt));

  const rows = await query;
  const filtered = rows.filter((row) => {
    if (category && row.category !== category) return false;
    if (q && !row.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  res.json({ sections: filtered });
});

// POST /api/products/:productId/email-sections
router.post("/products/:productId/email-sections", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = saveSectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid section" });
    return;
  }

  const [inserted] = await db
    .insert(emailSavedSectionsTable)
    .values({
      productId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      category: parsed.data.category ?? "custom",
      tags: parsed.data.tags ?? [],
      sectionsJson: parsed.data.sections,
    })
    .returning();

  res.status(201).json({ section: inserted });
});

// PATCH /api/email-sections/:id
router.patch("/email-sections/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(emailSavedSectionsTable).where(eq(emailSavedSectionsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Section not found" }); return; }
  if (!await canAccessProduct(req, existing.productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const patch: Partial<typeof emailSavedSectionsTable.$inferInsert> = {};
  if (typeof req.body.name === "string") patch.name = req.body.name.trim();
  if (req.body.description !== undefined) patch.description = req.body.description?.trim() || null;
  if (typeof req.body.category === "string") patch.category = req.body.category;
  if (Array.isArray(req.body.tags)) patch.tags = req.body.tags;
  if (Array.isArray(req.body.sections)) {
    const coerced = coerceSections(req.body.sections);
    if (!coerced) { res.status(400).json({ error: "Invalid sections array" }); return; }
    patch.sectionsJson = coerced;
  }

  const [updated] = await db.update(emailSavedSectionsTable).set(patch).where(eq(emailSavedSectionsTable.id, id)).returning();
  res.json({ section: updated });
});

// DELETE /api/email-sections/:id
router.delete("/email-sections/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(emailSavedSectionsTable).where(eq(emailSavedSectionsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Section not found" }); return; }
  if (!await canAccessProduct(req, existing.productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(emailSavedSectionsTable).where(eq(emailSavedSectionsTable.id, id));
  res.json({ ok: true });
});

// POST /api/email-sections/render-preview
router.post("/email-sections/render-preview", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const productId = typeof req.body.productId === "number" ? req.body.productId : null;
  if (productId && !await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const sections = coerceSections(req.body.sections);
  const templateId = typeof req.body.templateId === "number" ? req.body.templateId : null;
  const legacyBody = typeof req.body.body === "string" ? req.body.body : "";

  const html = sections?.length
    ? await renderStepContent(sections, "", productId, templateId)
    : legacyBody;

  if (!html && sections?.length) {
    const brand = await loadBrandForProduct(productId ?? undefined);
    res.json({ html: renderSections(sections, brand, appPublicUrl()) });
    return;
  }

  res.json({ html: html || legacyBody });
});

export { coerceSections, renderStepContent };
export default router;
