/**
 * Per-user email identity for a product (team members' own From / signature / footer).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { productsTable, userProductEmailSettingsTable } from "@workspace/db/schema";
import { canAccessProduct } from "../lib/productAccess";

const router: IRouter = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || !req.user?.id) {
    res.status(401).json({ error: "Not authenticated" });
    return false;
  }
  return true;
}

function parseProductId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const emptySettings = {
  fromName: null as string | null,
  fromEmail: null as string | null,
  emailSignature: null as string | null,
  unsubscribeFooterText: null as string | null,
  unsubscribeSenderLabel: null as string | null,
  unsubscribeSupportEmail: null as string | null,
};

// GET /api/products/:productId/my-email-settings
router.get("/products/:productId/my-email-settings", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const productId = parseProductId(req.params.productId);
  if (!productId) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }
  if (!await canAccessProduct(req, productId)) {
    res.status(403).json({ error: "You do not have access to this product" });
    return;
  }

  const [product] = await db
    .select({ id: productsTable.id, name: productsTable.name })
    .from(productsTable)
    .where(eq(productsTable.id, productId))
    .limit(1);
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const [row] = await db
    .select()
    .from(userProductEmailSettingsTable)
    .where(and(
      eq(userProductEmailSettingsTable.userId, req.user!.id),
      eq(userProductEmailSettingsTable.productId, productId),
    ))
    .limit(1);

  res.json({
    productId,
    productName: product.name,
    ...(row
      ? {
          fromName: row.fromName,
          fromEmail: row.fromEmail,
          emailSignature: row.emailSignature,
          unsubscribeFooterText: row.unsubscribeFooterText,
          unsubscribeSenderLabel: row.unsubscribeSenderLabel,
          unsubscribeSupportEmail: row.unsubscribeSupportEmail,
        }
      : emptySettings),
  });
});

// PATCH /api/products/:productId/my-email-settings
router.patch("/products/:productId/my-email-settings", async (req: Request, res: Response): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const productId = parseProductId(req.params.productId);
  if (!productId) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }
  if (!await canAccessProduct(req, productId)) {
    res.status(403).json({ error: "You do not have access to this product" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const asNullableString = (value: unknown): string | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  };

  const patch = {
    fromName: asNullableString(body.fromName),
    fromEmail: asNullableString(body.fromEmail),
    emailSignature: asNullableString(body.emailSignature),
    unsubscribeFooterText: asNullableString(body.unsubscribeFooterText),
    unsubscribeSenderLabel: asNullableString(body.unsubscribeSenderLabel),
    unsubscribeSupportEmail: asNullableString(body.unsubscribeSupportEmail),
  };

  if (patch.fromEmail !== undefined && patch.fromEmail !== null) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.fromEmail)) {
      res.status(400).json({ error: "Enter a valid sender email address" });
      return;
    }
  }
  if (patch.unsubscribeSupportEmail !== undefined && patch.unsubscribeSupportEmail !== null) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patch.unsubscribeSupportEmail)) {
      res.status(400).json({ error: "Enter a valid support email address" });
      return;
    }
  }

  const [existing] = await db
    .select({ id: userProductEmailSettingsTable.id })
    .from(userProductEmailSettingsTable)
    .where(and(
      eq(userProductEmailSettingsTable.userId, req.user!.id),
      eq(userProductEmailSettingsTable.productId, productId),
    ))
    .limit(1);

  const values = {
    fromName: patch.fromName === undefined ? undefined : patch.fromName,
    fromEmail: patch.fromEmail === undefined ? undefined : patch.fromEmail,
    emailSignature: patch.emailSignature === undefined ? undefined : patch.emailSignature,
    unsubscribeFooterText: patch.unsubscribeFooterText === undefined ? undefined : patch.unsubscribeFooterText,
    unsubscribeSenderLabel: patch.unsubscribeSenderLabel === undefined ? undefined : patch.unsubscribeSenderLabel,
    unsubscribeSupportEmail: patch.unsubscribeSupportEmail === undefined ? undefined : patch.unsubscribeSupportEmail,
    updatedAt: new Date(),
  };

  // Drop undefined keys so we don't overwrite with undefined
  const clean = Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== undefined),
  ) as typeof values;

  let row;
  if (existing) {
    [row] = await db
      .update(userProductEmailSettingsTable)
      .set(clean)
      .where(eq(userProductEmailSettingsTable.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(userProductEmailSettingsTable)
      .values({
        userId: req.user!.id,
        productId,
        fromName: patch.fromName ?? null,
        fromEmail: patch.fromEmail ?? null,
        emailSignature: patch.emailSignature ?? null,
        unsubscribeFooterText: patch.unsubscribeFooterText ?? null,
        unsubscribeSenderLabel: patch.unsubscribeSenderLabel ?? null,
        unsubscribeSupportEmail: patch.unsubscribeSupportEmail ?? null,
      })
      .returning();
  }

  res.json({
    productId,
    fromName: row.fromName,
    fromEmail: row.fromEmail,
    emailSignature: row.emailSignature,
    unsubscribeFooterText: row.unsubscribeFooterText,
    unsubscribeSenderLabel: row.unsubscribeSenderLabel,
    unsubscribeSupportEmail: row.unsubscribeSupportEmail,
  });
});

export default router;
