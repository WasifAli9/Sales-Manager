/**
 * Social media content automation routes.
 */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { socialPostsTable, socialAccountsTable, productsTable, usersTable } from "@workspace/db/schema";
import { eq, and, gte, lte, isNotNull, isNull } from "drizzle-orm";
import { sendEmail, salesFromEmail } from "../lib/email";
import { runMonthlyAutoGenerate } from "../lib/runMonthlyAutoGenerate";
import { randomUUID } from "crypto";
import { openai } from "@workspace/integrations-openai-ai-server";
// Direct OpenAI client for image generation — chat helpers do not support DALL-E.
import { createDirectOpenAI } from "../lib/ai";
const imageOpenAI = createDirectOpenAI();
import { objectStorageClient } from "../lib/objectStorage";
import { logger } from "../lib/logger";
import { appPublicUrl } from "../lib/appUrl";
import {
  evaluateSkipGate,
  applyProductResult,
  applyProductFailure,
  getNextMonthKey,
} from "../lib/socialScheduleHelpers";

// ── Generation progress tracking ──────────────────────────────────────────────
type GenerationProgress = {
  message: string;
  step: number;
  total: number;
  done: boolean;
  currentImage?: number;   // which image is being generated right now
  totalImages?: number;    // total images to generate
  currentTheme?: string;   // theme label for the current image
  competitors?: string[];
  brandColors?: string[];
  error?: string;
};
const generationProgress = new Map<number, GenerationProgress>();

// ── Cancellation registry ─────────────────────────────────────────────────────
// A product id present here means the next loop iteration should stop.
const cancelledGenerations = new Set<number>();

// ── Background image generation (shared by schedule gen + resume endpoint) ─────
async function startBackgroundImageGeneration(
  productId: number,
  posts: Array<{ id: number; imagePrompt: string | null; theme: string | null }>,
  extra: { competitors?: string[]; brandColors?: string[] } = {},
): Promise<void> {
  const pending = posts.filter(p => p.imagePrompt);
  const totalImages = pending.length;
  if (totalImages === 0) return;

  // Clear any stale cancellation flag from a previous run
  cancelledGenerations.delete(productId);

  logger.info({ productId, count: totalImages }, "social: background image gen starting");

  let successCount = 0;

  for (let i = 0; i < pending.length; i++) {
    // Check for cancellation before each image
    if (cancelledGenerations.has(productId)) {
      cancelledGenerations.delete(productId);
      generationProgress.set(productId, {
        message: `Stopped — ${successCount} of ${totalImages} images generated.`,
        step: 7,
        total: 7,
        done: true,
        currentImage: successCount,
        totalImages,
        ...extra,
      });
      logger.info({ productId, successCount, totalImages }, "social: image gen stopped by user");
      return;
    }

    const post = pending[i];
    generationProgress.set(productId, {
      message: `Generating image ${i + 1} of ${totalImages}…`,
      step: 7,
      total: 7,
      done: false,
      currentImage: i + 1,
      totalImages,
      currentTheme: post.theme ?? undefined,
      ...extra,
    });

    try {
      const imageUrl = await generateAndStoreImage(post.imagePrompt!);
      if (imageUrl) {
        await db
          .update(socialPostsTable)
          .set({ imageUrl })
          .where(eq(socialPostsTable.id, post.id));
        successCount++;
        logger.info({ productId, postId: post.id, n: i + 1, total: totalImages }, "social: image saved");
      }
    } catch (err) {
      logger.error({ err, postId: post.id }, "social: image gen failed");
    }
  }

  if (successCount === 0 && totalImages > 0) {
    // Every image failed — mark as done with an error so the frontend
    // stops auto-retrying and shows a clear message instead.
    generationProgress.set(productId, {
      message: "Image generation failed — check your OpenAI API key setup.",
      step: 7,
      total: 7,
      done: true,
      currentImage: 0,
      totalImages,
      error: "Image generation failed. Check that OPENAI_API_KEY is set correctly.",
      ...extra,
    });
    logger.error({ productId, totalImages }, "social: all image gen attempts failed — stopping");
  } else {
    generationProgress.set(productId, {
      message: successCount === totalImages ? "All visuals ready!" : `${successCount} of ${totalImages} images generated.`,
      step: 7,
      total: 7,
      done: true,
      currentImage: successCount,
      totalImages,
      ...extra,
    });
    logger.info({ productId, successCount, totalImages }, "social: image gen complete");
  }
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const router = Router();

// ── inline auth guard ─────────────────────────────────────────────────────────
function requireAuth(req: Request, res: Response): boolean {
  if (!(req as any).user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function parseStoragePath(path: string): { bucketName: string; objectName: string } {
  const p = path.startsWith("/") ? path : "/" + path;
  const parts = p.split("/");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function storeBufferToStorage(
  buffer: Buffer,
  folder: string,
  ext: string,
  contentType: string,
): Promise<string | null> {
  try {
    const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/$/, "");
    if (!privateDir) return null;
    const objectId = `${folder}/${randomUUID()}.${ext}`;
    const { bucketName, objectName } = parseStoragePath(`${privateDir}/${objectId}`);
    await objectStorageClient.bucket(bucketName).file(objectName).save(buffer, { contentType });
    return `/api/storage/objects/${objectId}`;
  } catch (err) {
    logger.error({ err }, "social: failed to store buffer");
    return null;
  }
}

async function storeImageFromUrl(imageUrl: string, folder = "social-images"): Promise<string | null> {
  try {
    const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/$/, "");
    if (!privateDir) return imageUrl;

    const uuid = randomUUID();
    const objectId = `${folder}/${uuid}.png`;
    const fullPath = `${privateDir}/${objectId}`;
    const { bucketName, objectName } = parseStoragePath(fullPath);

    const resp = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
    if (!resp.ok) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());

    await objectStorageClient.bucket(bucketName).file(objectName).save(buffer, {
      contentType: "image/png",
    });

    return `/api/storage/objects/${objectId}`;
  } catch (err) {
    logger.error({ err }, "social: failed to store image");
    return null;
  }
}

async function generateAndStoreImage(prompt: string): Promise<string | null> {
  try {
    // Use OPENAI_API_KEY directly for image models. gpt-image-1 returns
    // base64 JSON (no URL), so we convert
    // to a buffer and store it directly without a second fetch.
    const result = await imageOpenAI.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: "medium",
      n: 1,
    } as Parameters<typeof imageOpenAI.images.generate>[0]);

    const imageResult = result as { data?: Array<{ b64_json?: string; url?: string }> };
    const b64 = imageResult.data?.[0]?.b64_json;
    if (!b64) {
      // Fallback: some variants still return a URL
      const url = imageResult.data?.[0]?.url;
      if (url) return await storeImageFromUrl(url);
      return null;
    }

    const buffer = Buffer.from(b64, "base64");
    return await storeImageFromBuffer(buffer);
  } catch (err) {
    logger.error({ err }, "social: image generation failed");
    return null;
  }
}

async function storeImageFromBuffer(buffer: Buffer, folder = "social-images"): Promise<string | null> {
  try {
    const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/$/, "");
    if (!privateDir) return null;

    const uuid = randomUUID();
    const objectId = `${folder}/${uuid}.png`;
    const fullPath = `${privateDir}/${objectId}`;
    const { bucketName, objectName } = parseStoragePath(fullPath);

    await objectStorageClient.bucket(bucketName).file(objectName).save(buffer, {
      contentType: "image/png",
    });

    return `/api/storage/objects/${objectId}`;
  } catch (err) {
    logger.error({ err }, "social: failed to store image buffer");
    return null;
  }
}

async function scrapeWebsite(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CloserCRM/1.0)" },
      signal: AbortSignal.timeout(15_000),
    });
    const html = await resp.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);
  } catch {
    return "";
  }
}

async function scrapeWebsiteRaw(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CloserCRM/1.0)" },
      signal: AbortSignal.timeout(15_000),
    });
    return await resp.text();
  } catch {
    return "";
  }
}

function extractBrandColors(html: string): string[] {
  const hexPattern = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  const freq = new Map<string, number>();
  let match;
  while ((match = hexPattern.exec(html)) !== null) {
    const raw = match[0].toLowerCase();
    const hex =
      raw.length === 4
        ? "#" + raw[1] + raw[1] + raw[2] + raw[2] + raw[3] + raw[3]
        : raw;
    const ignore = new Set([
      "#000000","#ffffff","#111111","#222222","#333333","#444444",
      "#555555","#666666","#777777","#888888","#999999","#aaaaaa",
      "#bbbbbb","#cccccc","#dddddd","#eeeeee","#f5f5f5","#fafafa",
      "#1a1a1a","#0d0d0d","#e5e5e5","#f0f0f0","#f9f9f9","#121212",
      "#0a0a0a","#141414","#1c1c1c","#2a2a2a","#3a3a3a","#4a4a4a",
    ]);
    if (!ignore.has(hex)) freq.set(hex, (freq.get(hex) ?? 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([c]) => c);
}

async function extractBrandIntelligence(
  websiteText: string,
  websiteUrl: string,
): Promise<{ audience: string; voice: string; industry: string; competitors: string[] }> {
  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: "You are a brand strategist. Return valid JSON only." },
        {
          role: "user",
          content: `Analyze this website and return JSON:
- audience: who they serve (2-3 sentences describing the ideal customer)
- voice: brand voice and tone (1-2 sentences)
- industry: specific industry/niche (e.g. "B2B SaaS for sales teams")
- competitors: array of 8 real, well-known website URLs (https://domain.com format) of competitors OR inspirational brands in the exact same space

WEBSITE: ${websiteUrl}
CONTENT: ${websiteText.slice(0, 2000)}

Return JSON only: {"audience":"...","voice":"...","industry":"...","competitors":["https://..."]}`,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
    });
    const raw = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      audience?: string; voice?: string; industry?: string; competitors?: string[];
    };
    return {
      audience: parsed.audience ?? "business professionals",
      voice: parsed.voice ?? "professional and engaging",
      industry: parsed.industry ?? "B2B software",
      competitors: (parsed.competitors ?? [])
        .filter((u: unknown) => typeof u === "string" && (u as string).startsWith("http"))
        .slice(0, 8) as string[],
    };
  } catch (err) {
    logger.error({ err }, "social: brand intelligence failed");
    return { audience: "business professionals", voice: "professional", industry: "B2B software", competitors: [] };
  }
}

async function verifyCompetitorUrls(
  urls: string[],
): Promise<{ url: string; name: string }[]> {
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const resp = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(6_000),
        redirect: "follow",
      });
      if (resp.status >= 500) throw new Error(`${resp.status}`);
      const name = new URL(url).hostname.replace(/^www\./, "");
      return { url, name };
    }),
  );
  return results
    .filter(
      (r): r is PromiseFulfilledResult<{ url: string; name: string }> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value);
}

/** Inclusive day count from startDate (YYYY-MM-DD) through the last day of that month. */
function daysFromStartToMonthEnd(startDate: string): number {
  const [y, m, d] = startDate.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return Math.max(1, lastDay - d + 1);
}

/** Local-ish UTC calendar date YYYY-MM-DD (server clock). */
function todayISODate(): string {
  return new Date().toISOString().split("T")[0]!;
}

/**
 * If generating for the current month, never start before today.
 * Future months keep the requested start (usually the 1st).
 */
function clampScheduleStartDate(requestedStart: string): string {
  const today = todayISODate();
  const monthKey = requestedStart.slice(0, 7);
  const currentMonthKey = today.slice(0, 7);
  if (monthKey === currentMonthKey && requestedStart < today) return today;
  return requestedStart;
}

async function generateContentCalendarEnhanced(
  product: { name: string; description: string | null; aiSummary: string | null },
  websiteText: string,
  startDate: string,
  brand: {
    audience: string;
    voice: string;
    industry: string;
    colors: string[];
    competitors: { name: string }[];
  },
  styleGuide?: string,
): Promise<ContentPost[]> {
  const dayCount = daysFromStartToMonthEnd(startDate);
  const colorHint =
    brand.colors.length > 0
      ? `Brand colours to weave into image prompts: ${brand.colors.join(", ")}.`
      : "";
  const compHint =
    brand.competitors.length > 0
      ? `Top sites for creative inspiration: ${brand.competitors.map((c) => c.name).join(", ")}.`
      : "";
  const styleHint = styleGuide
    ? `\nVISUAL STYLE GUIDE (apply to EVERY image prompt): ${styleGuide}`
    : "";

  const resp = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [
      {
        role: "system",
        content:
          "You are a world-class social media strategist and creative director. " +
          "Create scroll-stopping, platform-native content. " +
          "Instagram: bold hook in the first line, emojis, story-driven (100-150 chars). " +
          "LinkedIn: authoritative, insight-led, professional tone (150-200 chars). " +
          "Image prompts must be vivid, detailed descriptions — include style, lighting, mood, composition, and subject. " +
          (styleGuide
            ? "IMPORTANT: every image prompt must faithfully reflect the visual style guide provided by the user. "
            : "") +
          "Return valid JSON only.",
      },
      {
        role: "user",
        content: `Generate a ${dayCount}-day social media content calendar covering ONLY the remaining days of the month.

BUSINESS: ${product.name}
DESCRIPTION: ${product.description ?? "B2B software"}
AI SUMMARY: ${product.aiSummary ?? ""}
WEBSITE EXCERPT: ${websiteText.slice(0, 1800)}
TARGET AUDIENCE: ${brand.audience}
BRAND VOICE: ${brand.voice}
INDUSTRY: ${brand.industry}
${colorHint}
${compHint}${styleHint}
START DATE: ${startDate}
DAY COUNT: ${dayCount}

Rules:
- Create exactly ${dayCount} daily entries, one for each date from START DATE through the last day of that month.
- Do NOT include any date before START DATE.
- Dates must be consecutive calendar days starting at START DATE.

Return JSON:
{
  "posts": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "theme": "short punchy theme",
      "instagram": {
        "caption": "Hook line + story with emojis ✨ (100-150 chars)",
        "hashtags": "#tag1 #tag2 #tag3 #tag4 #tag5",
        "imagePrompt": "Detailed image prompt — vivid style, mood, lighting, subject, composition${brand.colors.length > 0 ? ", brand colours: " + brand.colors.slice(0, 3).join(", ") : ""}${styleGuide ? " — apply visual style guide" : ""}"
      },
      "linkedin": {
        "caption": "Professional, insight-driven caption (150-200 chars)",
        "hashtags": "#tag1 #tag2 #tag3",
        "imagePrompt": "Detailed image prompt for a clean, professional branded graphic — modern design, relevant to the industry${styleGuide ? " — apply visual style guide" : ""}"
      }
    }
    // ... all ${dayCount} days
  ]
}

Vary themes: product features, customer pain points, tips & tricks, company values, social proof, industry trends, tutorials, behind-the-scenes, calls to action, community.`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 32000,
  });

  const raw = resp.choices[0]?.message?.content ?? "{}";

  // ── Robust parsing: recover whatever posts came through even if truncated ──
  try {
    const parsed = JSON.parse(raw) as { posts?: ContentPost[] };
    const posts = parsed.posts ?? [];
    if (posts.length > 0) return posts.filter((p) => p.date >= startDate);
    // Empty posts array from a valid JSON response — fall through to recovery
  } catch {
    // JSON was truncated — try to salvage complete post objects below
    logger.warn({ finishReason: resp.choices[0]?.finish_reason }, "social: calendar JSON truncated, attempting recovery");
  }

  // Recovery: extract every complete post object from the partial JSON.
  // A post is complete when it has both "instagram" and "linkedin" blocks closed.
  const recovered: ContentPost[] = [];
  // Match each complete top-level post object: starts with {"day": and ends with the second closing }}.
  // Use a simple bracket-depth walker to find complete objects inside the posts array.
  const arrayStart = raw.indexOf('"posts"');
  if (arrayStart !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    let objStart = -1;
    for (let i = arrayStart; i < raw.length; i++) {
      const ch = raw[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\" && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") {
        if (depth === 1) objStart = i; // start of a post object (depth 1 = inside the array)
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 1 && objStart !== -1) {
          // We have a complete post object
          try {
            const post = JSON.parse(raw.slice(objStart, i + 1)) as ContentPost;
            if (post.day && post.date && post.instagram && post.linkedin) {
              recovered.push(post);
            }
          } catch { /* skip malformed */ }
          objStart = -1;
        }
      } else if (ch === "[" && depth === 0) {
        depth++; // opening of the posts array itself
      }
    }
  }

  if (recovered.length > 0) {
    logger.info({ count: recovered.length }, "social: recovered posts from truncated response");
    return recovered.filter((p) => p.date >= startDate);
  }

  throw new Error(
    `AI returned an empty or unparseable calendar (finish_reason: ${resp.choices[0]?.finish_reason ?? "unknown"}). ` +
    `Try again — if it keeps failing, shorten the product description.`,
  );
}

type ContentPost = {
  day: number;
  date: string;
  theme: string;
  instagram: { caption: string; hashtags: string; imagePrompt: string };
  linkedin: { caption: string; hashtags: string; imagePrompt: string };
};

async function generateContentCalendar(
  product: { name: string; description: string | null; aiSummary: string | null },
  websiteText: string,
  startDate: string,
): Promise<ContentPost[]> {
  const dayCount = daysFromStartToMonthEnd(startDate);
  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [
      {
        role: "system",
        content:
          "You are a world-class social media strategist and copywriter. " +
          "Instagram: punchy, visual, story-driven, emojis. " +
          "LinkedIn: professional, insight-driven, thought leadership. " +
          "Return valid JSON only.",
      },
      {
        role: "user",
        content: `Generate a ${dayCount}-day social media content calendar covering ONLY the remaining days of the month.

BUSINESS: ${product.name}
DESCRIPTION: ${product.description || "B2B software product"}
AI SUMMARY: ${product.aiSummary || ""}
WEBSITE EXCERPT: ${websiteText}
START DATE: ${startDate}
DAY COUNT: ${dayCount}

Rules:
- Create exactly ${dayCount} daily entries from START DATE through month end.
- Do NOT include any date before START DATE.

Return JSON: {
  "posts": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "theme": "short theme e.g. Product Feature",
      "instagram": {
        "caption": "100-150 chars with emojis",
        "hashtags": "#tag1 #tag2 #tag3 #tag4 #tag5",
        "imagePrompt": "detailed DALL-E 3 prompt for an artistic eye-catching image"
      },
      "linkedin": {
        "caption": "150-200 chars professional tone",
        "hashtags": "#tag1 #tag2 #tag3",
        "imagePrompt": "detailed DALL-E 3 prompt for a clean professional branded card"
      }
    }
    ...all ${dayCount} days
  ]
}

Vary themes: product features, pain points, tips, company values, testimonials, thought leadership, industry trends, tutorials, behind-the-scenes, calls to action.`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 8000,
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { posts?: ContentPost[] };
  return (parsed.posts ?? []).filter((p) => p.date >= startDate);
}

// ── GET /api/products/:productId/social/posts ─────────────────────────────────
router.get("/products/:productId/social/posts", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const productId = parseInt(req.params["productId"] as string);
    const { month, platform, status } = req.query as Record<string, string>;

    const posts = await db
      .select()
      .from(socialPostsTable)
      .where(
        and(
          eq(socialPostsTable.productId, productId),
          platform ? eq(socialPostsTable.platform, platform) : undefined,
          status   ? eq(socialPostsTable.status,   status)   : undefined,
          month    ? gte(socialPostsTable.scheduledDate, `${month}-01`) : undefined,
          month    ? lte(socialPostsTable.scheduledDate, `${month}-31`) : undefined,
        ),
      )
      .orderBy(socialPostsTable.scheduledDate, socialPostsTable.platform);

    res.json({ posts });
  } catch (err) {
    logger.error({ err }, "social: list posts");
    res.status(500).json({ error: "Failed to fetch posts" });
  }
});

// ── GET /api/products/:productId/social/accounts ──────────────────────────────
router.get("/products/:productId/social/accounts", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const productId = parseInt(req.params["productId"] as string);
    const rows = await db
      .select()
      .from(socialAccountsTable)
      .where(eq(socialAccountsTable.productId, productId));

    res.json({
      accounts: rows.map(a => ({
        id:          a.id,
        productId:   a.productId,
        platform:    a.platform,
        accountId:   a.accountId,
        accountName: a.accountName,
        connected:   !!a.accessToken,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

// ── PUT /api/products/:productId/social/accounts/:platform ───────────────────
router.put("/products/:productId/social/accounts/:platform", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const productId = parseInt(req.params["productId"] as string);
    const platform  = req.params["platform"] as string;
    const { accessToken, accountId, accountName } = req.body as {
      accessToken: string; accountId: string; accountName: string;
    };

    const existing = await db
      .select()
      .from(socialAccountsTable)
      .where(and(eq(socialAccountsTable.productId, productId), eq(socialAccountsTable.platform, platform)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(socialAccountsTable)
        .set({ accessToken, accountId, accountName, updatedAt: new Date() })
        .where(eq(socialAccountsTable.id, existing[0].id));
    } else {
      await db.insert(socialAccountsTable).values({ productId, platform, accessToken, accountId, accountName });
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save account" });
  }
});

// ── DELETE /api/products/:productId/social/accounts/:platform ────────────────
router.delete("/products/:productId/social/accounts/:platform", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const productId = parseInt(req.params["productId"] as string);
    const platform  = req.params["platform"] as string;
    await db
      .delete(socialAccountsTable)
      .where(and(eq(socialAccountsTable.productId, productId), eq(socialAccountsTable.platform, platform)));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to disconnect account" });
  }
});

// ── GET /api/products/:productId/social/generation-status ─────────────────────
// Returns the in-memory generation progress, plus a DB-backed `hasPendingImages`
// flag so the frontend can detect stuck images after a server restart.
router.get("/products/:productId/social/generation-status", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseInt(req.params["productId"] as string);
  const prog = generationProgress.get(productId);

  // Check DB for posts that still need images (survives server restarts)
  let hasPendingImages = false;
  try {
    const [row] = await db
      .select({ id: socialPostsTable.id })
      .from(socialPostsTable)
      .where(
        and(
          eq(socialPostsTable.productId, productId),
          isNotNull(socialPostsTable.imagePrompt),
          isNull(socialPostsTable.imageUrl),
        ),
      )
      .limit(1);
    hasPendingImages = !!row;
  } catch { /* ignore — DB check is best-effort */ }

  if (!prog) {
    res.json({ active: false, hasPendingImages });
    return;
  }
  res.json({ active: !prog.done, hasPendingImages, ...prog });
});

// ── POST /api/products/:productId/social/resume-images ────────────────────────
// Restarts image generation for any post that has an imagePrompt but no imageUrl.
// Safe to call multiple times — no-ops if generation is already in progress.
router.post("/products/:productId/social/resume-images", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseInt(req.params["productId"] as string);

  // Don't double-start
  const prog = generationProgress.get(productId);
  if (prog && !prog.done) {
    res.json({ ok: true, alreadyRunning: true, count: 0 });
    return;
  }

  try {
    const posts = await db
      .select({ id: socialPostsTable.id, imagePrompt: socialPostsTable.imagePrompt, theme: socialPostsTable.theme })
      .from(socialPostsTable)
      .where(
        and(
          eq(socialPostsTable.productId, productId),
          isNotNull(socialPostsTable.imagePrompt),
          isNull(socialPostsTable.imageUrl),
        ),
      );

    if (posts.length === 0) {
      res.json({ ok: true, count: 0 });
      return;
    }

    logger.info({ productId, count: posts.length }, "social: resuming image generation");
    setImmediate(() => void startBackgroundImageGeneration(productId, posts));
    res.json({ ok: true, count: posts.length });
  } catch (err) {
    logger.error({ err }, "social: resume-images failed");
    res.status(500).json({ error: "Failed to resume image generation" });
  }
});

// ── POST /api/products/:productId/social/stop-generation ─────────────────────
// Signals the running background loop to stop after the current image finishes.
// The loop checks cancelledGenerations before each image and exits cleanly.
router.post("/products/:productId/social/stop-generation", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseInt(req.params["productId"] as string);
  const prog = generationProgress.get(productId);
  if (!prog || prog.done) {
    res.json({ ok: true, alreadyStopped: true });
    return;
  }
  cancelledGenerations.add(productId);
  logger.info({ productId }, "social: stop requested");
  res.json({ ok: true });
});

// ── Re-export types so consumers can import them from this module ─────────────
export type {
  ScheduleProduct,
  SchedulePost,
  GenerateScheduleForProductDeps,
} from "../lib/generateScheduleForProduct";

import {
  generateScheduleForProduct as _generateScheduleForProductImpl,
} from "../lib/generateScheduleForProduct";

// ── Real (DB-backed) implementations ─────────────────────────────────────────

function makeRealDeps() {
  return {
    fetchProduct: async (productId: number) => {
      const [product] = await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.id, productId))
        .limit(1);
      return product;
    },

    checkExistingPosts: async (productId: number, monthKey: string) =>
      db
        .select({ id: socialPostsTable.id })
        .from(socialPostsTable)
        .where(
          and(
            eq(socialPostsTable.productId, productId),
            gte(socialPostsTable.scheduledDate, `${monthKey}-01`),
            lte(socialPostsTable.scheduledDate, `${monthKey}-31`),
          ),
        )
        .limit(1),

    deletePosts: async (productId: number, monthKey: string) => {
      await db.delete(socialPostsTable).where(
        and(
          eq(socialPostsTable.productId, productId),
          gte(socialPostsTable.scheduledDate, `${monthKey}-01`),
          lte(socialPostsTable.scheduledDate, `${monthKey}-31`),
        ),
      );
    },

    scrapeWebsiteText: scrapeWebsite,

    generateCalendar: generateContentCalendar,

    insertPosts: async (rows: (typeof socialPostsTable.$inferInsert)[]) => {
      await db.insert(socialPostsTable).values(rows);
    },

    fetchInserted: async (productId: number, monthKey: string) =>
      db
        .select({ id: socialPostsTable.id, imagePrompt: socialPostsTable.imagePrompt })
        .from(socialPostsTable)
        .where(
          and(
            eq(socialPostsTable.productId, productId),
            gte(socialPostsTable.scheduledDate, `${monthKey}-01`),
            lte(socialPostsTable.scheduledDate, `${monthKey}-31`),
          ),
        ),

    updateImageUrl: async (postId: number, imageUrl: string) => {
      await db.update(socialPostsTable).set({ imageUrl }).where(eq(socialPostsTable.id, postId));
    },

    generateImage: generateAndStoreImage,

    log: logger,

    scheduleBackground: (fn: () => Promise<void>) => setImmediate(fn),
  };
}

// ── Shared schedule generation (used by route + monthly cron) ─────────────────
export async function generateScheduleForProduct(
  productId: number,
  monthKey: string,       // "YYYY-MM"
  opts: { skipIfExists?: boolean } = {},
): Promise<{ skipped?: boolean; count: number }> {
  return _generateScheduleForProductImpl(productId, monthKey, opts, makeRealDeps());
}

// ── Helpers for notification email ───────────────────────────────────────────

function appUrl(): string {
  return appPublicUrl();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSocialScheduleEmail(
  generatedProducts: { id: number; name: string; count: number }[],
  monthLabel: string,
  base: string,
): string {
  const rows = generatedProducts
    .map(
      (p) => `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;">
          <strong style="color:#111;">${escapeHtml(p.name)}</strong>
        </td>
        <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;text-align:center;color:#555;">
          ${p.count} posts
        </td>
        <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;text-align:right;">
          <a href="${base}/products/${p.id}?tab=social"
             style="color:#4f46e5;text-decoration:none;font-weight:500;">Review →</a>
        </td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <!-- header -->
        <tr>
          <td style="background:#4f46e5;padding:24px 32px;">
            <span style="color:#fff;font-size:20px;font-weight:700;">📅 Social schedule ready</span>
          </td>
        </tr>
        <!-- intro -->
        <tr>
          <td style="padding:24px 32px 8px;">
            <p style="margin:0;color:#333;font-size:15px;">
              Next month's social media schedule (<strong>${escapeHtml(monthLabel)}</strong>) has been
              auto-generated and is ready for your review.
            </p>
          </td>
        </tr>
        <!-- table -->
        <tr>
          <td style="padding:8px 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
              <thead>
                <tr style="background:#f5f5f5;">
                  <th style="padding:10px 16px;text-align:left;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;">Product</th>
                  <th style="padding:10px 16px;text-align:center;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;">Posts</th>
                  <th style="padding:10px 16px;text-align:right;font-size:12px;color:#888;font-weight:600;text-transform:uppercase;">Action</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </td>
        </tr>
        <!-- footer -->
        <tr>
          <td style="padding:0 32px 28px;">
            <p style="margin:0;color:#999;font-size:12px;">
              Posts are in <em>pending approval</em> status — approve or edit them from the Social tab before they go live.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Dependency-injection types (used by tests to wire in stubs) ───────────────
// ── Monthly auto-generation: all products with a website URL ──────────────────
export type AutoGenerateDeps = {
  /** Injected per-product generator; defaults to the real `generateScheduleForProduct`. */
  generateFn?: (
    productId: number,
    monthKey: string,
    opts: { skipIfExists?: boolean },
  ) => Promise<{ skipped?: boolean; count: number }>;
};

export async function autoGenerateMonthlySchedules(
  _deps: AutoGenerateDeps = {},
): Promise<{ generated: number; skipped: number; failed: number }> {
  // Target = next calendar month
  const now      = new Date();
  const monthKey = getNextMonthKey(now);
  const nextM    = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return runMonthlyAutoGenerate(
    {
      fetchProducts: async () =>
        db
          .select({ id: productsTable.id, name: productsTable.name })
          .from(productsTable)
          .where(isNotNull(productsTable.websiteUrl)),
      generateSchedule: _deps.generateFn ?? generateScheduleForProduct,
      fetchOwners: async () =>
        db
          .select({ email: usersTable.email, name: usersTable.name })
          .from(usersTable)
          .where(eq(usersTable.role, "owner")),
      sendNotification: async (opts) => {
        const result = await sendEmail({ ...opts, from: salesFromEmail() });
        return result.ok ? result.id : null;
      },
      buildEmail: buildSocialScheduleEmail,
      getBaseUrl: appUrl,
      log: logger,
    },
    monthKey,
    nextM,
  );
}

// ── GET /api/products/:productId/social/style ────────────────────────────────
// Returns the last-used style guide and preset id for this product.
router.get("/products/:productId/social/style", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseInt(req.params["productId"] as string);
  try {
    const [product] = await db
      .select({ socialImageStyle: productsTable.socialImageStyle, socialImageStylePreset: productsTable.socialImageStylePreset })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }
    res.json({
      styleGuide: product.socialImageStyle ?? null,
      stylePreset: product.socialImageStylePreset ?? null,
    });
  } catch (err) {
    logger.error({ err }, "social: get style failed");
    res.status(500).json({ error: "Failed to fetch style" });
  }
});

// ── DELETE /api/products/:productId/social/style ──────────────────────────────
// Clears the saved style (owner only).
router.delete("/products/:productId/social/style", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const user = (req as any).user;
  if (user?.role !== "owner") { res.status(403).json({ error: "Only owners can reset the style" }); return; }
  const productId = parseInt(req.params["productId"] as string);
  try {
    await db
      .update(productsTable)
      .set({ socialImageStyle: null, socialImageStylePreset: null })
      .where(eq(productsTable.id, productId));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "social: clear style failed");
    res.status(500).json({ error: "Failed to clear style" });
  }
});

// ── POST /api/products/:productId/social/analyze-style ───────────────────────
// Accepts a base64-encoded reference image and returns an AI-extracted style
// guide string that can be injected into image prompts.
router.post("/products/:productId/social/analyze-style", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { imageBase64, mimeType } = req.body as {
      imageBase64?: string;
      mimeType?: string;
    };
    if (!imageBase64 || !mimeType) {
      res.status(400).json({ error: "imageBase64 and mimeType are required" });
      return;
    }
    const supportedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!supportedTypes.includes(mimeType)) {
      res.status(400).json({ error: "Unsupported image type. Use JPEG, PNG, WEBP, or GIF." });
      return;
    }

    const result = await imageOpenAI.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "You are an expert art director. Analyse the reference image and write a concise visual style guide " +
            "(2-4 sentences) that can be appended to any AI image generation prompt to produce images with a similar aesthetic. " +
            "Focus on: colour palette and tone, lighting quality and direction, mood and atmosphere, composition style, " +
            "texture/finish, and overall aesthetic character. " +
            "Start with the most distinctive quality. Do not mention specific subjects, brands, or people. " +
            "Output only the style guide text — no preamble, no bullet points.",
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "low" },
            },
            { type: "text", text: "Write the visual style guide for this image." },
          ],
        },
      ],
    });

    const styleGuide = result.choices[0]?.message?.content?.trim() ?? "";
    if (!styleGuide) {
      res.status(500).json({ error: "Could not extract a style guide from this image." });
      return;
    }
    res.json({ styleGuide });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "social: style analysis failed");
    res.status(500).json({ error: `Style analysis failed: ${msg}` });
  }
});

// ── Asset analysis helper ─────────────────────────────────────────────────────
async function fetchAssetAsBase64(
  storageUrl: string,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const privateDir = (process.env.PRIVATE_OBJECT_DIR || "").replace(/\/$/, "");
    if (!privateDir) return null;
    const relPath = storageUrl.replace(/^\/api\/storage\/objects\//, "");
    const { bucketName, objectName } = parseStoragePath(`${privateDir}/${relPath}`);
    const [buffer] = await objectStorageClient.bucket(bucketName).file(objectName).download();
    const ext = objectName.split(".").pop()?.toLowerCase() ?? "png";
    const mimeType =
      ext === "jpg" || ext === "jpeg" ? "image/jpeg"
      : ext === "webp" ? "image/webp"
      : ext === "gif"  ? "image/gif"
      : "image/png";
    return { base64: (buffer as Buffer).toString("base64"), mimeType };
  } catch (err) {
    logger.warn({ err, storageUrl }, "assets: fetch for analysis failed — skipping");
    return null;
  }
}

async function analyzeAssetsForGeneration(assetUrls: string[]): Promise<string> {
  const descriptions: string[] = [];
  for (const url of assetUrls) {
    const data = await fetchAssetAsBase64(url);
    if (!data) continue;
    try {
      const result = await imageOpenAI.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 150,
        messages: [
          {
            role: "system",
            content:
              "You are a brand asset specialist. Describe this brand asset in 1–2 sentences, " +
              "focusing on its visual elements: shape, colors, style, key graphic marks. " +
              "This description will be injected into AI image generation prompts to incorporate the asset.",
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${data.mimeType};base64,${data.base64}`, detail: "low" },
              },
              { type: "text", text: "Describe this brand asset for AI image generation." },
            ],
          },
        ],
      });
      const desc = result.choices[0]?.message?.content?.trim();
      if (desc) descriptions.push(desc);
    } catch {
      // non-fatal — skip this asset
    }
  }
  if (descriptions.length === 0) return "";
  return (
    `Brand assets to incorporate into every image: ${descriptions.join("; ")}. ` +
    `Reference these visual elements — logo marks, brand colours, or graphic style — where appropriate in each composition.`
  );
}

// ── POST /api/products/:productId/social/generate-schedule ───────────────────
router.post("/products/:productId/social/generate-schedule", async (req, res) => {
  if (!requireAuth(req, res)) return;
  const productId = parseInt(req.params["productId"] as string);

  const setProgress = (
    message: string,
    step: number,
    extra: Partial<GenerationProgress> = {},
  ) => {
    generationProgress.set(productId, {
      message,
      step,
      total: 7,
      done: false,
      ...extra,
    });
  };

  try {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);

    if (!product) { res.status(404).json({ error: "Product not found" }); return; }
    if (!product.websiteUrl) {
      res.status(400).json({
        error: "Add a website URL to this product first — go to product settings.",
      });
      return;
    }

    const body = req.body as {
      startDate?: string;
      styleGuide?: string;
      stylePreset?: string;
      assetUrls?: string[];
    };
    const requestedStart = body.startDate ?? todayISODate();
    const startDate   = clampScheduleStartDate(requestedStart);
    const stylePreset = body.stylePreset || undefined;
    const assetUrls   = Array.isArray(body.assetUrls) ? body.assetUrls : [];
    const monthKey    = startDate.slice(0, 7);
    let   styleGuide  = body.styleGuide || undefined;

    // ── Step 1: Scrape homepage raw HTML ─────────────────────────────────────
    setProgress("Reading your website…", 1);
    logger.info({ productId, url: product.websiteUrl }, "social: scraping raw html");
    const rawHtml = await scrapeWebsiteRaw(product.websiteUrl);
    const websiteText = rawHtml
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);

    // ── Step 2: Extract brand colours ────────────────────────────────────────
    setProgress("Extracting your brand colours…", 2);
    const brandColors = extractBrandColors(rawHtml);
    logger.info({ productId, brandColors }, "social: brand colours extracted");

    // ── Step 3: Brand intelligence (audience, voice, industry, competitors) ──
    setProgress("Understanding who you serve and how you sound…", 3);
    const brandIntel = await extractBrandIntelligence(websiteText, product.websiteUrl);
    logger.info({ productId, industry: brandIntel.industry }, "social: brand intel done");

    // ── Step 4: Find competitor / inspirational sites ────────────────────────
    setProgress("Finding businesses doing it well in your space…", 4);
    const liveCompetitors = await verifyCompetitorUrls(brandIntel.competitors);
    logger.info({ productId, found: liveCompetitors.length }, "social: competitors verified");
    setProgress(
      `Verified ${liveCompetitors.length} live sites worth borrowing from…`,
      4,
      { competitors: liveCompetitors.map((c) => c.name), brandColors },
    );

    // ── Step 4b: Analyse any selected brand assets ───────────────────────────
    if (assetUrls.length > 0) {
      setProgress(`Analysing ${assetUrls.length} brand asset${assetUrls.length > 1 ? "s" : ""}…`, 4, {
        competitors: liveCompetitors.map((c) => c.name),
        brandColors,
      });
      const assetDesc = await analyzeAssetsForGeneration(assetUrls);
      if (assetDesc) {
        styleGuide = styleGuide ? `${styleGuide}\n\n${assetDesc}` : assetDesc;
        logger.info({ productId, assets: assetUrls.length }, "social: brand assets analysed");
      }
    }

    // ── Step 5: Generate content calendar ────────────────────────────────────
    setProgress("Building your content calendar…", 5, {
      competitors: liveCompetitors.map((c) => c.name),
      brandColors,
    });
    logger.info({ productId, monthKey }, "social: generating enhanced calendar");

    // Clear all posts for this month, then recreate only from startDate forward
    await db.delete(socialPostsTable).where(
      and(
        eq(socialPostsTable.productId, productId),
        gte(socialPostsTable.scheduledDate, `${monthKey}-01`),
        lte(socialPostsTable.scheduledDate, `${monthKey}-31`),
      ),
    );

    const contentPosts = await generateContentCalendarEnhanced(
      product,
      websiteText,
      startDate,
      {
        audience: brandIntel.audience,
        voice: brandIntel.voice,
        industry: brandIntel.industry,
        colors: brandColors,
        competitors: liveCompetitors,
      },
      styleGuide,
    );

    // ── Step 6: Insert posts ──────────────────────────────────────────────────
    setProgress("Saving posts to your calendar…", 6, {
      competitors: liveCompetitors.map((c) => c.name),
      brandColors,
    });

    if (contentPosts.length > 0) {
      const rows: (typeof socialPostsTable.$inferInsert)[] = [];
      for (const p of contentPosts) {
        if (p.date < startDate) continue;
        rows.push({
          productId, platform: "instagram",
          scheduledDate: p.date, status: "pending_approval",
          theme: p.theme, caption: p.instagram.caption, hashtags: p.instagram.hashtags,
          imagePrompt: p.instagram.imagePrompt, generatedAt: new Date(),
        });
        rows.push({
          productId, platform: "linkedin",
          scheduledDate: p.date, status: "pending_approval",
          theme: p.theme, caption: p.linkedin.caption, hashtags: p.linkedin.hashtags,
          imagePrompt: p.linkedin.imagePrompt, generatedAt: new Date(),
        });
      }
      await db.insert(socialPostsTable).values(rows);
    }

    const inserted = await db
      .select()
      .from(socialPostsTable)
      .where(
        and(
          eq(socialPostsTable.productId, productId),
          gte(socialPostsTable.scheduledDate, startDate),
          lte(socialPostsTable.scheduledDate, `${monthKey}-31`),
        ),
      )
      .orderBy(socialPostsTable.scheduledDate, socialPostsTable.platform);

    // ── Persist the chosen style on the product for next time ────────────────
    if (styleGuide) {
      await db
        .update(productsTable)
        .set({ socialImageStyle: styleGuide, socialImageStylePreset: stylePreset ?? null })
        .where(eq(productsTable.id, productId));
    }

    // ── Step 7: Background image generation ──────────────────────────────────
    generationProgress.set(productId, {
      message: "Generating visuals — they'll appear as they complete…",
      step: 7,
      total: 7,
      done: false,
      competitors: liveCompetitors.map((c) => c.name),
      brandColors,
    });

    setImmediate(() =>
      void startBackgroundImageGeneration(productId, inserted, {
        competitors: liveCompetitors.map((c) => c.name),
        brandColors,
      }),
    );

    res.json({ posts: inserted, generating: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, productId }, "social: schedule generation failed");
    generationProgress.set(productId, {
      message: "Generation failed — please try again.",
      step: 0,
      total: 7,
      done: true,
      error: message,
    });
    res.status(500).json({ error: `Generation failed: ${message}` });
  }
});

// ── GET /api/social-posts/:id ─────────────────────────────────────────────────
router.get("/social-posts/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const [post] = await db
      .select()
      .from(socialPostsTable)
      .where(eq(socialPostsTable.id, parseInt(req.params["id"] as string)))
      .limit(1);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch post" });
  }
});

// ── DELETE /api/social-posts/:id ─────────────────────────────────────────────
router.delete("/social-posts/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const postId = parseInt(req.params["id"] as string);
    await db.delete(socialPostsTable).where(eq(socialPostsTable.id, postId));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "social: delete post");
    res.status(500).json({ error: "Failed to delete post" });
  }
});

// ── DELETE /api/products/:productId/social/posts?month=YYYY-MM ────────────────
router.delete("/products/:productId/social/posts", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const productId = parseInt(req.params["productId"] as string);
    const { month } = req.query as Record<string, string>;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      res.status(400).json({ error: "month query param required (YYYY-MM)" });
      return;
    }
    await db
      .delete(socialPostsTable)
      .where(
        and(
          eq(socialPostsTable.productId, productId),
          gte(socialPostsTable.scheduledDate, `${month}-01`),
          lte(socialPostsTable.scheduledDate, `${month}-31`),
        ),
      );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "social: delete month posts");
    res.status(500).json({ error: "Failed to delete posts" });
  }
});

// ── POST /api/social-posts/:id/upload-image ───────────────────────────────────
router.post("/social-posts/:id/upload-image", upload.single("image"), async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const postId = parseInt(req.params["id"] as string);
    if (!req.file) { res.status(400).json({ error: "No image file provided" }); return; }

    const ext = req.file.mimetype === "image/jpeg" ? "jpg"
      : req.file.mimetype === "image/webp" ? "webp" : "png";
    const imageUrl = await storeBufferToStorage(req.file.buffer, "social-images", ext, req.file.mimetype);
    if (!imageUrl) { res.status(500).json({ error: "Failed to store image" }); return; }

    const [post] = await db
      .update(socialPostsTable)
      .set({ imageUrl })
      .where(eq(socialPostsTable.id, postId))
      .returning();
    res.json({ post });
  } catch (err) {
    logger.error({ err }, "social: upload image failed");
    res.status(500).json({ error: "Failed to upload image" });
  }
});

// ── POST /api/social-posts/:id/upload-document ────────────────────────────────
router.post("/social-posts/:id/upload-document", upload.single("document"), async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const postId = parseInt(req.params["id"] as string);
    if (!req.file) { res.status(400).json({ error: "No document file provided" }); return; }

    const documentUrl = await storeBufferToStorage(req.file.buffer, "social-documents", "pdf", "application/pdf");
    if (!documentUrl) { res.status(500).json({ error: "Failed to store document" }); return; }

    const [post] = await db
      .update(socialPostsTable)
      .set({ documentUrl })
      .where(eq(socialPostsTable.id, postId))
      .returning();
    res.json({ post });
  } catch (err) {
    logger.error({ err }, "social: upload document failed");
    res.status(500).json({ error: "Failed to upload document" });
  }
});

// ── PUT /api/social-posts/:id ─────────────────────────────────────────────────
router.put("/social-posts/:id", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const { caption, hashtags, videoUrl } = req.body as {
      caption: string; hashtags: string; videoUrl?: string | null;
    };
    const updates: Partial<typeof socialPostsTable.$inferInsert> = { caption, hashtags };
    if (videoUrl !== undefined) updates.videoUrl = videoUrl ?? null;
    const [post] = await db
      .update(socialPostsTable)
      .set(updates)
      .where(eq(socialPostsTable.id, parseInt(req.params["id"] as string)))
      .returning();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: "Failed to update post" });
  }
});

// ── POST /api/social-posts/:id/approve ───────────────────────────────────────
router.post("/social-posts/:id/approve", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const [post] = await db
      .update(socialPostsTable)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(socialPostsTable.id, parseInt(req.params["id"] as string)))
      .returning();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: "Failed to approve" });
  }
});

// ── POST /api/social-posts/:id/reject ────────────────────────────────────────
router.post("/social-posts/:id/reject", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const [post] = await db
      .update(socialPostsTable)
      .set({ status: "rejected" })
      .where(eq(socialPostsTable.id, parseInt(req.params["id"] as string)))
      .returning();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: "Failed to reject" });
  }
});

// ── PATCH /api/social-posts/:id/move — change the scheduled date ─────────────
router.patch("/social-posts/:id/move", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const postId = parseInt(req.params["id"] as string);
    const { date } = req.body as { date: string };
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: "date must be YYYY-MM-DD" });
      return;
    }
    const [post] = await db
      .update(socialPostsTable)
      .set({ scheduledDate: date })
      .where(eq(socialPostsTable.id, postId))
      .returning();
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: "Failed to move post" });
  }
});

// ── POST /api/social-posts/:id/regenerate ────────────────────────────────────
router.post("/social-posts/:id/regenerate", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const postId = parseInt(req.params["id"] as string);
    const [existing] = await db.select().from(socialPostsTable).where(eq(socialPostsTable.id, postId)).limit(1);
    if (!existing) { res.status(404).json({ error: "Post not found" }); return; }

    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, existing.productId)).limit(1);

    // Allow the caller to override the theme/topic
    const customTheme = (req.body as { theme?: string }).theme?.trim() || null;
    const effectiveTheme = customTheme ?? existing.theme ?? "General";

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: "You are a social media copywriter. Return valid JSON only." },
        {
          role: "user",
          content: `Regenerate a fresh ${existing.platform} post.
BUSINESS: ${product?.name ?? "Unknown"}
TOPIC / THEME: ${effectiveTheme}
DATE: ${existing.scheduledDate}

Return JSON: { "theme": "...", "caption": "...", "hashtags": "...", "imagePrompt": "..." }
${existing.platform === "instagram" ? "Caption: punchy, emoji-rich, 100-150 chars." : "Caption: professional insight-led, 150-200 chars."}`,
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 500,
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as {
      theme?: string; caption?: string; hashtags?: string; imagePrompt?: string;
    };

    const [updated] = await db
      .update(socialPostsTable)
      .set({
        theme:        parsed.theme        ?? effectiveTheme,
        caption:      parsed.caption      ?? existing.caption,
        hashtags:     parsed.hashtags     ?? existing.hashtags,
        imagePrompt:  parsed.imagePrompt  ?? existing.imagePrompt,
        imageUrl:     null,
        status:       "pending_approval",
        generatedAt:  new Date(),
      })
      .where(eq(socialPostsTable.id, postId))
      .returning();

    res.json({ post: updated });

    if (updated.imagePrompt) {
      setImmediate(async () => {
        const imageUrl = await generateAndStoreImage(updated.imagePrompt!);
        if (imageUrl) await db.update(socialPostsTable).set({ imageUrl }).where(eq(socialPostsTable.id, postId));
      });
    }
  } catch (err) {
    logger.error({ err }, "social: regenerate failed");
    res.status(500).json({ error: "Failed to regenerate" });
  }
});

// ── POST /api/social-posts/:id/post-now ──────────────────────────────────────
router.post("/social-posts/:id/post-now", async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const postId = parseInt(req.params["id"] as string);
    const [post] = await db.select().from(socialPostsTable).where(eq(socialPostsTable.id, postId)).limit(1);
    if (!post) { res.status(404).json({ error: "Post not found" }); return; }

    const [account] = await db
      .select()
      .from(socialAccountsTable)
      .where(and(eq(socialAccountsTable.productId, post.productId), eq(socialAccountsTable.platform, post.platform)))
      .limit(1);

    if (!account?.accessToken) {
      res.status(400).json({ error: `No ${post.platform} account connected.` });
      return;
    }
    if (!post.imageUrl) {
      res.status(400).json({ error: "Image not yet generated. Wait a moment and try again." });
      return;
    }

    const fullCaption = [post.caption, post.hashtags].filter(Boolean).join("\n\n");
    const baseUrl     = process.env.PUBLIC_BASE_URL ?? "";
    const absImg      = post.imageUrl.startsWith("http") ? post.imageUrl : `${baseUrl}${post.imageUrl}`;

    let platformPostId: string | null = null;
    let postUrl:        string | null = null;
    let errorMessage:   string | null = null;

    if (post.platform === "instagram") {
      const cRes = await fetch(
        `https://graph.facebook.com/v19.0/${account.accountId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: absImg, caption: fullCaption, access_token: account.accessToken }),
        },
      );
      if (!cRes.ok) {
        const e = await cRes.json() as { error?: { message?: string } };
        errorMessage = e.error?.message ?? "Instagram media creation failed";
      } else {
        const { id: containerId } = await cRes.json() as { id: string };
        const pRes = await fetch(
          `https://graph.facebook.com/v19.0/${account.accountId}/media_publish`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ creation_id: containerId, access_token: account.accessToken }),
          },
        );
        if (!pRes.ok) {
          const e = await pRes.json() as { error?: { message?: string } };
          errorMessage = e.error?.message ?? "Instagram publish failed";
        } else {
          const { id } = await pRes.json() as { id: string };
          platformPostId = id;
          postUrl = `https://www.instagram.com/p/${id}/`;
        }
      }
    } else if (post.platform === "linkedin") {
      const orgUrn = account.accountId?.startsWith("urn:") ? account.accountId : `urn:li:organization:${account.accountId}`;
      const regRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${account.accessToken}` },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
            owner: orgUrn,
            serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
          },
        }),
      });
      if (!regRes.ok) {
        errorMessage = "LinkedIn image registration failed";
      } else {
        const rd = await regRes.json() as {
          value?: {
            asset?: string;
            uploadMechanism?: { "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"?: { uploadUrl?: string } };
          };
        };
        const uploadUrl = rd.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
        const assetUrn  = rd.value?.asset;

        if (uploadUrl && assetUrn) {
          const imgBuf = await (await fetch(absImg)).arrayBuffer();
          await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: imgBuf });

          const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${account.accessToken}`,
              "X-Restli-Protocol-Version": "2.0.0",
            },
            body: JSON.stringify({
              author: orgUrn,
              lifecycleState: "PUBLISHED",
              specificContent: {
                "com.linkedin.ugc.ShareContent": {
                  shareCommentary: { text: fullCaption },
                  shareMediaCategory: "IMAGE",
                  media: [{ status: "READY", media: assetUrn }],
                },
              },
              visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
            }),
          });
          if (!postRes.ok) {
            const e = await postRes.json() as { message?: string };
            errorMessage = e.message ?? "LinkedIn post failed";
          } else {
            const pd = await postRes.json() as { id?: string };
            platformPostId = pd.id ?? null;
            postUrl = platformPostId ? `https://www.linkedin.com/feed/update/${platformPostId}/` : null;
          }
        } else {
          errorMessage = "LinkedIn upload URL not returned";
        }
      }
    }

    const [updated] = await db
      .update(socialPostsTable)
      .set({
        status:         errorMessage ? "failed" : "posted",
        platformPostId,
        postUrl,
        errorMessage,
        postedAt:       errorMessage ? undefined : new Date(),
      })
      .where(eq(socialPostsTable.id, postId))
      .returning();

    if (errorMessage) {
      res.status(400).json({ error: errorMessage, post: updated });
      return;
    }
    res.json({ post: updated });
  } catch (err) {
    logger.error({ err }, "social: post-now failed");
    res.status(500).json({ error: "Failed to post" });
  }
});

export default router;

// ── scheduler export ──────────────────────────────────────────────────────────
export async function postApprovedSocialPosts(): Promise<{ posted: number; failed: number }> {
  const today = new Date().toISOString().split("T")[0];
  let posted = 0, failed = 0;

  const due = await db
    .select()
    .from(socialPostsTable)
    .where(and(eq(socialPostsTable.status, "approved"), eq(socialPostsTable.scheduledDate, today)));

  for (const post of due) {
    const [account] = await db
      .select()
      .from(socialAccountsTable)
      .where(and(eq(socialAccountsTable.productId, post.productId), eq(socialAccountsTable.platform, post.platform)))
      .limit(1);

    if (!account?.accessToken || !post.imageUrl) {
      await db.update(socialPostsTable)
        .set({ status: "failed", errorMessage: !account?.accessToken ? "No account connected" : "Image not ready" })
        .where(eq(socialPostsTable.id, post.id));
      failed++;
      continue;
    }

    try {
      const fullCaption = [post.caption, post.hashtags].filter(Boolean).join("\n\n");
      const baseUrl     = process.env.PUBLIC_BASE_URL ?? "";
      const absImg      = post.imageUrl.startsWith("http") ? post.imageUrl : `${baseUrl}${post.imageUrl}`;
      let platformPostId: string | null = null;
      let postUrl:        string | null = null;

      if (post.platform === "instagram") {
        const cRes = await fetch(`https://graph.facebook.com/v19.0/${account.accountId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: absImg, caption: fullCaption, access_token: account.accessToken }),
        });
        if (cRes.ok) {
          const { id: cid } = await cRes.json() as { id: string };
          const pRes = await fetch(`https://graph.facebook.com/v19.0/${account.accountId}/media_publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ creation_id: cid, access_token: account.accessToken }),
          });
          if (pRes.ok) { const { id } = await pRes.json() as { id: string }; platformPostId = id; postUrl = `https://www.instagram.com/p/${id}/`; }
        }
      } else if (post.platform === "linkedin") {
        const orgUrn = account.accountId?.startsWith("urn:") ? account.accountId : `urn:li:organization:${account.accountId}`;
        const regRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${account.accessToken}` },
          body: JSON.stringify({ registerUploadRequest: { recipes: ["urn:li:digitalmediaRecipe:feedshare-image"], owner: orgUrn, serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }] } }),
        });
        if (regRes.ok) {
          const rd = await regRes.json() as { value?: { asset?: string; uploadMechanism?: { "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"?: { uploadUrl?: string } } } };
          const uploadUrl = rd.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
          const assetUrn  = rd.value?.asset;
          if (uploadUrl && assetUrn) {
            await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: await (await fetch(absImg)).arrayBuffer() });
            const pr = await fetch("https://api.linkedin.com/v2/ugcPosts", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${account.accessToken}`, "X-Restli-Protocol-Version": "2.0.0" },
              body: JSON.stringify({ author: orgUrn, lifecycleState: "PUBLISHED", specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: fullCaption }, shareMediaCategory: "IMAGE", media: [{ status: "READY", media: assetUrn }] } }, visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" } }),
            });
            if (pr.ok) { const pd = await pr.json() as { id?: string }; platformPostId = pd.id ?? null; postUrl = platformPostId ? `https://www.linkedin.com/feed/update/${platformPostId}/` : null; }
          }
        }
      }

      await db.update(socialPostsTable)
        .set({ status: "posted", platformPostId, postUrl, postedAt: new Date() })
        .where(eq(socialPostsTable.id, post.id));
      posted++;
    } catch (err) {
      logger.error({ err, postId: post.id }, "social: scheduled post failed");
      await db.update(socialPostsTable)
        .set({ status: "failed", errorMessage: String(err) })
        .where(eq(socialPostsTable.id, post.id));
      failed++;
    }
  }

  return { posted, failed };
}
