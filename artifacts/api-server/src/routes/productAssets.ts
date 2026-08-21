/**
 * Product asset library — logos, screenshots and other brand images
 * that reps can select in the style picker to include in image generation.
 */
import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { productAssetsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { objectStorageClient } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router = Router();

function requireAuth(req: Request, res: Response): boolean {
  if (!(req as any).user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function parseStoragePath(path: string): { bucketName: string; objectName: string } {
  const p = path.startsWith("/") ? path : "/" + path;
  const parts = p.split("/");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

// ── GET /api/products/:id/assets ──────────────────────────────────────────────
router.get("/products/:productId/assets", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const productId = parseInt(req.params["productId"] as string);
    const assets = await db
      .select()
      .from(productAssetsTable)
      .where(eq(productAssetsTable.productId, productId))
      .orderBy(productAssetsTable.createdAt);
    res.json({ assets });
  } catch (err) {
    logger.error({ err }, "assets: list failed");
    res.status(500).json({ error: "Failed to fetch assets" });
  }
});

// ── POST /api/products/:id/assets ─────────────────────────────────────────────
// Body: { name: string; type: string; imageBase64: string; mimeType: string }
router.post("/products/:productId/assets", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const productId = parseInt(req.params["productId"] as string);
    const { name, type = "logo", imageBase64, mimeType } = req.body as {
      name?: string;
      type?: string;
      imageBase64?: string;
      mimeType?: string;
    };

    if (!name || !imageBase64 || !mimeType) {
      res.status(400).json({ error: "name, imageBase64, and mimeType are required" });
      return;
    }

    const supported = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!supported.includes(mimeType)) {
      res.status(400).json({ error: "Unsupported type. Use JPEG, PNG, WEBP, or GIF." });
      return;
    }

    const ext = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
    const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/$/, "");
    if (!privateDir) {
      res.status(500).json({ error: "Object storage is not configured." });
      return;
    }

    const objectId = `product-assets/${randomUUID()}.${ext}`;
    const { bucketName, objectName } = parseStoragePath(`${privateDir}/${objectId}`);
    const buffer = Buffer.from(imageBase64, "base64");
    await objectStorageClient.bucket(bucketName).file(objectName).save(buffer, { contentType: mimeType });
    const storageUrl = `/api/storage/objects/${objectId}`;

    const [inserted] = await db
      .insert(productAssetsTable)
      .values({ productId, name, type, storageUrl })
      .returning();

    res.json({ asset: inserted });
  } catch (err) {
    logger.error({ err }, "assets: upload failed");
    res.status(500).json({ error: "Upload failed" });
  }
});

// ── DELETE /api/products/:id/assets/:assetId ──────────────────────────────────
router.delete("/products/:productId/assets/:assetId", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const productId = parseInt(req.params["productId"] as string);
    const assetId   = parseInt(req.params["assetId"]   as string);

    const [asset] = await db
      .select()
      .from(productAssetsTable)
      .where(and(eq(productAssetsTable.id, assetId), eq(productAssetsTable.productId, productId)))
      .limit(1);

    if (!asset) { res.status(404).json({ error: "Not found" }); return; }

    // Delete from object storage (best-effort)
    try {
      const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/$/, "");
      const relPath = asset.storageUrl.replace("/api/storage/objects/", "");
      const { bucketName, objectName } = parseStoragePath(`${privateDir}/${relPath}`);
      await objectStorageClient.bucket(bucketName).file(objectName).delete();
    } catch {
      // Not fatal — remove DB record regardless
    }

    await db.delete(productAssetsTable).where(eq(productAssetsTable.id, assetId));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "assets: delete failed");
    res.status(500).json({ error: "Delete failed" });
  }
});

export default router;
