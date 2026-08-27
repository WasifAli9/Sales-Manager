/**
 * Product email brand profiles + reusable design templates.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import {
  emailBrandProfilesTable,
  emailDesignTemplatesTable,
  productAssetsTable,
  productsTable,
} from "@workspace/db/schema";
import { runJson } from "../lib/ai";
import { canAccessProduct } from "../lib/productAccess";
import { appPublicUrl } from "../lib/appUrl";
import {
  absoluteAssetUrl,
  defaultBrandColors,
  renderEmailDesign,
  sanitizeDesignShell,
} from "../lib/emailDesignRender";
import { loadBrandForProduct } from "../lib/emailDesignContext";

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

const hexColor = z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable();

const brandPatchSchema = z.object({
  logoAssetId: z.number().int().positive().nullable().optional(),
  primaryColor: hexColor,
  secondaryColor: hexColor,
  accentColor: hexColor,
  backgroundColor: hexColor,
  textColor: hexColor,
  fontStack: z.string().trim().max(300).optional().nullable(),
});

const templatePatchSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  category: z.enum(["plain", "light", "branded", "custom"]).optional(),
  designIntensity: z.number().int().min(1).max(4).optional(),
  htmlShell: z.string().trim().min(20).max(200_000).optional(),
  isActive: z.boolean().optional(),
});

async function resolveLogoUrl(logoAssetId: number | null | undefined) {
  if (!logoAssetId) return null;
  const [asset] = await db
    .select({ storageUrl: productAssetsTable.storageUrl })
    .from(productAssetsTable)
    .where(eq(productAssetsTable.id, logoAssetId))
    .limit(1);
  return absoluteAssetUrl(asset?.storageUrl, appPublicUrl());
}

// ── GET /api/products/:productId/email-brand ─────────────────────────────────
router.get("/products/:productId/email-brand", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [product] = await db.select({ name: productsTable.name }).from(productsTable).where(eq(productsTable.id, productId)).limit(1);
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const [profile] = await db
    .select()
    .from(emailBrandProfilesTable)
    .where(eq(emailBrandProfilesTable.productId, productId))
    .limit(1);

  const colors = defaultBrandColors();
  const logoAssetId = profile?.logoAssetId ?? null;
  res.json({
    productId,
    brandName: product.name,
    logoAssetId,
    logoUrl: await resolveLogoUrl(logoAssetId),
    primaryColor: profile?.primaryColor ?? colors.primaryColor,
    secondaryColor: profile?.secondaryColor ?? colors.secondaryColor,
    accentColor: profile?.accentColor ?? colors.accentColor,
    backgroundColor: profile?.backgroundColor ?? colors.backgroundColor,
    textColor: profile?.textColor ?? colors.textColor,
    fontStack: profile?.fontStack ?? colors.fontStack,
  });
});

// ── PATCH /api/products/:productId/email-brand ───────────────────────────────
router.patch("/products/:productId/email-brand", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = brandPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid brand settings" });
    return;
  }

  if (parsed.data.logoAssetId) {
    const [asset] = await db
      .select({ id: productAssetsTable.id })
      .from(productAssetsTable)
      .where(and(eq(productAssetsTable.id, parsed.data.logoAssetId), eq(productAssetsTable.productId, productId)))
      .limit(1);
    if (!asset) {
      res.status(400).json({ error: "Logo asset not found for this product" });
      return;
    }
  }

  const [existing] = await db
    .select({ id: emailBrandProfilesTable.id })
    .from(emailBrandProfilesTable)
    .where(eq(emailBrandProfilesTable.productId, productId))
    .limit(1);

  const patch = {
    logoAssetId: parsed.data.logoAssetId === undefined ? undefined : parsed.data.logoAssetId,
    primaryColor: parsed.data.primaryColor ?? undefined,
    secondaryColor: parsed.data.secondaryColor ?? undefined,
    accentColor: parsed.data.accentColor ?? undefined,
    backgroundColor: parsed.data.backgroundColor ?? undefined,
    textColor: parsed.data.textColor ?? undefined,
    fontStack: parsed.data.fontStack === undefined ? undefined : (parsed.data.fontStack || null),
  };

  if (existing) {
    await db.update(emailBrandProfilesTable).set(patch).where(eq(emailBrandProfilesTable.id, existing.id));
  } else {
    const colors = defaultBrandColors();
    await db.insert(emailBrandProfilesTable).values({
      productId,
      logoAssetId: patch.logoAssetId ?? null,
      primaryColor: patch.primaryColor ?? colors.primaryColor,
      secondaryColor: patch.secondaryColor ?? colors.secondaryColor,
      accentColor: patch.accentColor ?? colors.accentColor,
      backgroundColor: patch.backgroundColor ?? colors.backgroundColor,
      textColor: patch.textColor ?? colors.textColor,
      fontStack: patch.fontStack ?? colors.fontStack,
    });
  }

  const [product] = await db.select({ name: productsTable.name }).from(productsTable).where(eq(productsTable.id, productId)).limit(1);
  const [profile] = await db.select().from(emailBrandProfilesTable).where(eq(emailBrandProfilesTable.productId, productId)).limit(1);
  res.json({
    productId,
    brandName: product?.name ?? "Product",
    logoAssetId: profile?.logoAssetId ?? null,
    logoUrl: await resolveLogoUrl(profile?.logoAssetId ?? null),
    primaryColor: profile?.primaryColor,
    secondaryColor: profile?.secondaryColor,
    accentColor: profile?.accentColor,
    backgroundColor: profile?.backgroundColor,
    textColor: profile?.textColor,
    fontStack: profile?.fontStack,
  });
});

// ── GET /api/products/:productId/email-design-templates ──────────────────────
router.get("/products/:productId/email-design-templates", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const templates = await db
    .select()
    .from(emailDesignTemplatesTable)
    .where(and(eq(emailDesignTemplatesTable.productId, productId), eq(emailDesignTemplatesTable.isActive, true)))
    .orderBy(asc(emailDesignTemplatesTable.designIntensity), desc(emailDesignTemplatesTable.createdAt));

  res.json({ templates });
});

// ── POST /api/products/:productId/email-design-templates/generate ────────────
router.post("/products/:productId/email-design-templates/generate", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const brand = await loadBrandForProduct(productId, product.name);
  const productContext = [
    `Business name: ${product.name}`,
    product.tagline ? `Tagline: ${product.tagline}` : null,
    product.description ? `Description: ${product.description}` : null,
    product.valueProp ? `Value proposition: ${product.valueProp}` : null,
    product.icp ? `Audience: ${product.icp}` : null,
    product.targetMarket ? `Market: ${product.targetMarket}` : null,
    product.aiSummary ? `Summary: ${product.aiSummary}` : null,
    `Primary colour: ${brand.primaryColor}`,
    `Accent colour: ${brand.accentColor}`,
    `Background: ${brand.backgroundColor}`,
    `Text colour: ${brand.textColor}`,
    brand.logoUrl ? "Logo: available (use {{logo}} slot where appropriate)" : "Logo: not set (leave {{logo}} empty-safe)",
  ].filter(Boolean).join("\n");

  const prompt = `Create exactly 3 reusable HTML email DESIGN TEMPLATES for this B2B business.

BUSINESS / BRAND:
${productContext}

These are LAYOUT SHELLS only. They must NOT contain the actual sales email copy.
Every shell MUST include the exact placeholder {{body}} where the email content goes.
Optional placeholders you may use: {{logo}}, {{logoUrl}}, {{brandName}}, {{primaryColor}}, {{secondaryColor}}, {{accentColor}}, {{backgroundColor}}, {{textColor}}, {{fontStack}}, {{signature}}.

Rules:
1) Intensity 1 (category "plain"): Looks like a personal Gmail/Outlook email. No hero, no large logo header, no marketing chrome. Minimal HTML. Maybe a tiny optional {{logo}} above the body or none.
2) Intensity 2 (category "light"): Subtle branding. Small logo, restrained colour accents, optional understated CTA button chrome around content. Still feels personal.
3) Intensity 3 (category "branded"): Professional branded header with {{logo}} and {{brandName}}, brand colours, clear hierarchy, CTA button styling helpers, branded footer area with {{signature}}.

Technical:
- Email-safe HTML: tables for layout, inline CSS only, max-width ~600px.
- No JavaScript, no external stylesheets, no em dashes or en dashes in any text.
- Do not invent fake product claims inside the shell; use generic labels like "Read more" only if needed for chrome.
- Return JSON only:
{"templates":[{"name":"...","category":"plain|light|branded","designIntensity":1|2|3,"htmlShell":"..."}]}`;

  try {
    const { json } = await runJson(
      "You are an expert email designer specializing in email-safe HTML. Return only valid JSON.",
      prompt,
    );
    const raw = json as { templates?: Array<{ name?: string; category?: string; designIntensity?: number; htmlShell?: string }> };
    const list = Array.isArray(raw.templates) ? raw.templates : [];
    const cleaned = list
      .map((t) => ({
        name: String(t.name ?? "").trim().slice(0, 160),
        category: ["plain", "light", "branded", "custom"].includes(String(t.category))
          ? String(t.category)
          : "custom",
        designIntensity: Math.min(3, Math.max(1, Number(t.designIntensity) || 1)),
        htmlShell: sanitizeDesignShell(String(t.htmlShell ?? "").trim()),
      }))
      .filter((t) => t.name && t.htmlShell.includes("{{body}}"));

    if (cleaned.length < 1) {
      res.status(502).json({ error: "AI did not return usable design templates. Try again." });
      return;
    }

    // Keep prior templates; user can delete unused ones from the library.
    const inserted = await db
      .insert(emailDesignTemplatesTable)
      .values(cleaned.map((t) => ({
        productId,
        name: t.name,
        category: t.category,
        designIntensity: t.designIntensity,
        htmlShell: t.htmlShell,
        isActive: true,
      })))
      .returning();

    res.json({ templates: inserted });
  } catch (error) {
    req.log?.error?.({ error }, "email design template generation failed");
    res.status(500).json({ error: "Could not generate design templates. Please try again." });
  }
});

// ── PATCH /api/email-design-templates/:id ────────────────────────────────────
router.patch("/email-design-templates/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(emailDesignTemplatesTable).where(eq(emailDesignTemplatesTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Template not found" }); return; }
  if (!await canAccessProduct(req, existing.productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = templatePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid template" });
    return;
  }
  if (parsed.data.htmlShell && !parsed.data.htmlShell.includes("{{body}}")) {
    res.status(400).json({ error: "htmlShell must include {{body}}" });
    return;
  }

  const [updated] = await db
    .update(emailDesignTemplatesTable)
    .set({
      ...parsed.data,
      htmlShell: parsed.data.htmlShell ? sanitizeDesignShell(parsed.data.htmlShell) : undefined,
    })
    .where(eq(emailDesignTemplatesTable.id, id))
    .returning();

  res.json({ template: updated });
});

// ── DELETE /api/email-design-templates/:id ───────────────────────────────────
router.delete("/email-design-templates/:id", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(emailDesignTemplatesTable).where(eq(emailDesignTemplatesTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Template not found" }); return; }
  if (!await canAccessProduct(req, existing.productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.update(emailDesignTemplatesTable).set({ isActive: false }).where(eq(emailDesignTemplatesTable.id, id));
  res.json({ ok: true });
});

// ── POST /api/email-design-templates/:id/preview ─────────────────────────────
router.post("/email-design-templates/:id/preview", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const [template] = await db.select().from(emailDesignTemplatesTable).where(eq(emailDesignTemplatesTable.id, id)).limit(1);
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  if (!await canAccessProduct(req, template.productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const bodyHtml = typeof req.body?.body === "string" && req.body.body.trim()
    ? req.body.body
    : `<p>Hi {{firstName}},</p><p>This is a preview of your email content inside the design template.</p><p>Best regards</p>`;

  const brand = await loadBrandForProduct(template.productId);
  const html = renderEmailDesign({
    htmlShell: template.htmlShell,
    bodyHtml,
    brand,
    injectLogoWhenNoTemplate: false,
  });

  res.json({ html });
});

// ── POST /api/products/:productId/email-design/preview ───────────────────────
// Preview with optional templateId, sequence logo override, and body content.
router.post("/products/:productId/email-design/preview", async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const productId = parseId(req.params.productId);
  if (!productId) { res.status(400).json({ error: "Invalid product id" }); return; }
  if (!await canAccessProduct(req, productId)) { res.status(403).json({ error: "Forbidden" }); return; }

  const templateId = typeof req.body?.templateId === "number" ? req.body.templateId : null;
  const logoAssetId = typeof req.body?.logoAssetId === "number" ? req.body.logoAssetId : null;
  const bodyHtml = typeof req.body?.body === "string" ? req.body.body : "<p>Preview body</p>";
  const signatureHtml = typeof req.body?.signature === "string" ? req.body.signature : null;

  let htmlShell: string | null = null;
  if (templateId) {
    const [template] = await db
      .select()
      .from(emailDesignTemplatesTable)
      .where(and(eq(emailDesignTemplatesTable.id, templateId), eq(emailDesignTemplatesTable.productId, productId)))
      .limit(1);
    if (!template?.isActive) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    htmlShell = template.htmlShell;
  }

  const brand = await loadBrandForProduct(productId);
  if (logoAssetId) {
    brand.logoUrl = await resolveLogoUrl(logoAssetId);
  }

  const html = renderEmailDesign({
    htmlShell,
    bodyHtml,
    brand: { ...brand, signatureHtml },
    injectLogoWhenNoTemplate: true,
  });

  res.json({ html });
});

export default router;
