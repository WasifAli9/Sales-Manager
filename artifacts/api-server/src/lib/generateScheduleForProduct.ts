/**
 * Pure, dependency-injected implementation of the per-product social-schedule
 * generator.  All I/O (DB, AI, storage) is provided by callers via the `deps`
 * argument so this module has **no** workspace package imports and is safe to
 * run under `node --experimental-strip-types --test` without a bundler.
 *
 * The real (DB-backed) wiring lives in `../routes/socialPosts.ts`.
 */

import { sanitizeSocialCaption } from "./socialScheduleHelpers";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScheduleProduct = {
  id: number;
  name: string;
  description: string | null;
  aiSummary: string | null;
  websiteUrl: string | null;
};

export type SchedulePost = { id: number };

export type ContentPost = {
  day: number;
  date: string;
  theme: string;
  instagram: { caption: string; hashtags: string; imagePrompt: string };
  linkedin:  { caption: string; hashtags: string; imagePrompt: string };
};

/** Shape of a row ready to insert into the social_posts table. */
export type SocialPostRow = {
  productId: number;
  platform: string;
  scheduledDate: string;
  status: string;
  theme: string;
  caption: string;
  hashtags: string;
  imagePrompt: string;
  generatedAt: Date;
};

/**
 * All I/O operations needed by the schedule generator.
 * Every field is required here; `socialPosts.ts` passes the real implementations
 * and tests pass stubs.
 */
export type GenerateScheduleForProductDeps = {
  /** Fetch a single product by id. Return undefined/null when not found. */
  fetchProduct: (productId: number) => Promise<ScheduleProduct | undefined | null>;
  /** Return at most one existing post for (productId, monthKey) — used for skipIfExists. */
  checkExistingPosts: (productId: number, monthKey: string) => Promise<SchedulePost[]>;
  /** Delete all posts for (productId, monthKey). */
  deletePosts: (productId: number, monthKey: string) => Promise<void>;
  /** Scrape plain text from a URL. */
  scrapeWebsiteText: (url: string) => Promise<string>;
  /** Generate a 30-day content calendar. */
  generateCalendar: (
    product: ScheduleProduct,
    websiteText: string,
    startDate: string,
  ) => Promise<ContentPost[]>;
  /** Bulk-insert post rows. */
  insertPosts: (rows: SocialPostRow[]) => Promise<void>;
  /** Fetch the just-inserted posts (to count them and kick off image gen). */
  fetchInserted: (productId: number, monthKey: string) => Promise<{ id: number; imagePrompt: string | null }[]>;
  /** Store a generated image URL back onto a post. */
  updateImageUrl: (postId: number, imageUrl: string) => Promise<void>;
  /** Fire-and-forget image generation for a single prompt. */
  generateImage: (prompt: string) => Promise<string | null>;
  /** Logger (subset of pino). */
  log: { info: (obj: object, msg?: string) => void; error: (obj: object, msg?: string) => void };
  /** Schedule setImmediate-style async callbacks; injectable so tests stay synchronous. */
  scheduleBackground: (fn: () => Promise<void>) => void;
};

// ── Pure implementation ───────────────────────────────────────────────────────

export async function generateScheduleForProduct(
  productId: number,
  monthKey: string,          // "YYYY-MM"
  opts: { skipIfExists?: boolean } = {},
  deps: GenerateScheduleForProductDeps,
): Promise<{ skipped?: boolean; count: number }> {
  const product = await deps.fetchProduct(productId);

  if (!product?.websiteUrl) return { count: 0 };

  if (opts.skipIfExists) {
    const existing = await deps.checkExistingPosts(productId, monthKey);
    if (existing.length > 0) return { skipped: true, count: 0 };
  }

  // Clear existing posts for this month then regenerate
  await deps.deletePosts(productId, monthKey);

  deps.log.info({ productId, url: product.websiteUrl }, "social: scraping website");
  const websiteText = await deps.scrapeWebsiteText(product.websiteUrl);
  const startDate   = `${monthKey}-01`;

  // For the current calendar month, start from today so we don't schedule past days.
  // (Monthly auto-gen always targets next month, so this mainly helps manual/API callers.)
  const today = new Date().toISOString().split("T")[0]!;
  const effectiveStart =
    monthKey === today.slice(0, 7) && startDate < today ? today : startDate;

  deps.log.info({ productId, monthKey }, "social: generating content calendar");
  const contentPosts = await deps.generateCalendar(product, websiteText, effectiveStart);

  if (!contentPosts.length) return { count: 0 };

  const rows: SocialPostRow[] = [];
  for (const p of contentPosts) {
    if (p.date < effectiveStart) continue;
    rows.push({
      productId, platform: "instagram", scheduledDate: p.date, status: "pending_approval",
      theme: p.theme, caption: sanitizeSocialCaption(p.instagram.caption), hashtags: p.instagram.hashtags,
      imagePrompt: p.instagram.imagePrompt, generatedAt: new Date(),
    });
    rows.push({
      productId, platform: "linkedin", scheduledDate: p.date, status: "pending_approval",
      theme: p.theme, caption: sanitizeSocialCaption(p.linkedin.caption), hashtags: p.linkedin.hashtags,
      imagePrompt: p.linkedin.imagePrompt, generatedAt: new Date(),
    });
  }

  await deps.insertPosts(rows);

  const inserted = await deps.fetchInserted(productId, monthKey);

  // Fire-and-forget image generation
  deps.scheduleBackground(async () => {
    deps.log.info({ productId, count: inserted.length }, "social: generating images in background");
    for (const dbPost of inserted) {
      if (!dbPost.imagePrompt) continue;
      try {
        const imageUrl = await deps.generateImage(dbPost.imagePrompt);
        if (imageUrl) {
          await deps.updateImageUrl(dbPost.id, imageUrl);
        }
      } catch (err) {
        deps.log.error({ err, postId: dbPost.id }, "social: image gen failed");
      }
    }
    deps.log.info({ productId }, "social: background image generation complete");
  });

  return { count: inserted.length };
}
