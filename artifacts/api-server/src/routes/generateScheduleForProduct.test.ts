/**
 * Tests for generateScheduleForProduct's skipIfExists guard.
 *
 * Key invariants:
 *  1. When posts already exist for the (productId, monthKey) window,
 *     { skipIfExists: true } returns { skipped: true, count: 0 } and does NOT
 *     delete or recreate any posts.
 *  2. When no posts exist for that window, { skipIfExists: true } falls through
 *     and generation proceeds (skipped is absent / falsy).
 *  3. The guard is keyed on productId — posts for a *different* product in the
 *     same month must not trigger a skip.
 *  4. The guard is keyed on the month — posts for the *same* product in a
 *     different month must not trigger a skip.
 *  5. skipIfExists: false (or omitted) always runs generation regardless of
 *     pre-existing posts.
 *
 * These tests use full stub deps so no real DB, AI, or storage is touched.
 *
 * Run with: pnpm --filter @workspace/api-server test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  generateScheduleForProduct,
  type GenerateScheduleForProductDeps,
  type ScheduleProduct,
  type SchedulePost,
} from "../lib/generateScheduleForProduct.ts";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const PRODUCT_ID   = 42;
const OTHER_PRODUCT = 99;
const MONTH_KEY    = "2099-09";
const OTHER_MONTH  = "2099-10";

const MOCK_PRODUCT: ScheduleProduct = {
  id:          PRODUCT_ID,
  name:        "Acme SaaS",
  description: "B2B software",
  aiSummary:   null,
  websiteUrl:  "https://acme.example.com",
};

/** A stub ContentPost returned by the calendar generator. */
const STUB_CONTENT_POST = {
  day: 1,
  date: `${MONTH_KEY}-01`,
  theme: "Launch",
  instagram: { caption: "Hello IG 🚀", hashtags: "#launch", imagePrompt: "ig image" },
  linkedin:  { caption: "Hello LI",    hashtags: "#launch", imagePrompt: "li image" },
};

/** Noop logger that satisfies the pino-shaped interface used in the module. */
const noopLog = { info: () => {}, error: () => {} };

/**
 * Build a complete deps object. Every field has a safe default that records
 * whether it was called so assertions can check for unwanted side-effects.
 */
function makeDeps(
  overrides: Partial<GenerateScheduleForProductDeps> & {
    existingPosts?: SchedulePost[];
    deleteCalls?:  number[];
    insertCalls?:  number[];
  } = {},
): GenerateScheduleForProductDeps & { deleteCalls: number[]; insertCalls: number[] } {
  const deleteCalls: number[] = overrides.deleteCalls ?? [];
  const insertCalls: number[] = overrides.insertCalls ?? [];

  return {
    fetchProduct: overrides.fetchProduct ?? (async () => MOCK_PRODUCT),

    checkExistingPosts:
      overrides.checkExistingPosts ??
      (async () => overrides.existingPosts ?? []),

    deletePosts:
      overrides.deletePosts ??
      (async (productId) => {
        deleteCalls.push(productId);
      }),

    scrapeWebsiteText: overrides.scrapeWebsiteText ?? (async () => "stub website text"),

    generateCalendar:
      overrides.generateCalendar ?? (async () => [STUB_CONTENT_POST]),

    insertPosts:
      overrides.insertPosts ??
      (async (rows) => {
        insertCalls.push(rows.length);
      }),

    fetchInserted: overrides.fetchInserted ?? (async () => []),

    updateImageUrl: overrides.updateImageUrl ?? (async () => {}),

    generateImage: overrides.generateImage ?? (async () => null),

    log: overrides.log ?? { info: () => {}, error: () => {} },

    scheduleBackground: overrides.scheduleBackground ?? (() => {}),

    // expose side-effect accumulators so tests can assert on them
    deleteCalls,
    insertCalls,
  } as GenerateScheduleForProductDeps & { deleteCalls: number[]; insertCalls: number[] };
}

// ─── Suite 1: skipIfExists = true, posts already exist ───────────────────────

describe("generateScheduleForProduct – skipIfExists guard fires when posts exist", () => {
  it("returns { skipped: true, count: 0 } when existing posts are found", async () => {
    const deps = makeDeps({ existingPosts: [{ id: 1 }] });

    const result = await generateScheduleForProduct(
      PRODUCT_ID,
      MONTH_KEY,
      { skipIfExists: true },
      deps,
    );

    assert.equal(result.skipped, true,  "skipped must be true");
    assert.equal(result.count,   0,     "count must be 0");
  });

  it("does NOT delete existing posts when the guard fires", async () => {
    const deps = makeDeps({ existingPosts: [{ id: 1 }] });

    await generateScheduleForProduct(
      PRODUCT_ID,
      MONTH_KEY,
      { skipIfExists: true },
      deps,
    );

    assert.equal(
      deps.deleteCalls.length,
      0,
      "deletePosts must not be called when the guard skips generation",
    );
  });

  it("does NOT insert new posts when the guard fires", async () => {
    const deps = makeDeps({ existingPosts: [{ id: 1 }] });

    await generateScheduleForProduct(
      PRODUCT_ID,
      MONTH_KEY,
      { skipIfExists: true },
      deps,
    );

    assert.equal(
      deps.insertCalls.length,
      0,
      "insertPosts must not be called when the guard skips generation",
    );
  });

  it("does NOT call scrapeWebsiteText or generateCalendar when the guard fires", async () => {
    let scrapeCalls   = 0;
    let calendarCalls = 0;

    const deps = makeDeps({
      existingPosts:    [{ id: 1 }],
      scrapeWebsiteText: async () => { scrapeCalls++;   return ""; },
      generateCalendar:  async () => { calendarCalls++; return []; },
    });

    await generateScheduleForProduct(
      PRODUCT_ID,
      MONTH_KEY,
      { skipIfExists: true },
      deps,
    );

    assert.equal(scrapeCalls,   0, "scrapeWebsiteText must not be called when guard fires");
    assert.equal(calendarCalls, 0, "generateCalendar must not be called when guard fires");
  });
});

// ─── Suite 2: skipIfExists = true, no posts yet ──────────────────────────────

describe("generateScheduleForProduct – skipIfExists guard does NOT fire when no posts exist", () => {
  it("returns an object without skipped:true when no existing posts are found", async () => {
    const deps = makeDeps({ existingPosts: [] });

    const result = await generateScheduleForProduct(
      PRODUCT_ID,
      MONTH_KEY,
      { skipIfExists: true },
      deps,
    );

    assert.notEqual(result.skipped, true, "skipped must not be true when no posts exist");
  });

  it("calls deletePosts and insertPosts when no existing posts are found", async () => {
    const deps = makeDeps({ existingPosts: [] });

    await generateScheduleForProduct(
      PRODUCT_ID,
      MONTH_KEY,
      { skipIfExists: true },
      deps,
    );

    assert.ok(deps.deleteCalls.length > 0, "deletePosts should be called to clear the slate");
    assert.ok(deps.insertCalls.length > 0, "insertPosts should be called to write new posts");
  });

  it("passes the correct productId to deletePosts", async () => {
    const deps = makeDeps({ existingPosts: [] });

    await generateScheduleForProduct(
      PRODUCT_ID,
      MONTH_KEY,
      { skipIfExists: true },
      deps,
    );

    assert.ok(
      deps.deleteCalls.includes(PRODUCT_ID),
      `deletePosts must be called with productId=${PRODUCT_ID}`,
    );
  });
});

// ─── Suite 3: guard is scoped to the correct productId ───────────────────────

describe("generateScheduleForProduct – guard is keyed on productId", () => {
  it("does NOT skip when existing posts belong to a different product", async () => {
    // checkExistingPosts is supposed to filter by productId — but we simulate a
    // correct implementation that only returns posts for the requested product.
    const deps = makeDeps({
      checkExistingPosts: async (pid) => {
        // Only the other product has posts; this product has none
        return pid === OTHER_PRODUCT ? [{ id: 99 }] : [];
      },
    });

    const result = await generateScheduleForProduct(
      PRODUCT_ID,   // ← requesting schedule for PRODUCT_ID
      MONTH_KEY,
      { skipIfExists: true },
      deps,
    );

    assert.notEqual(result.skipped, true, "must not skip when other-product posts exist but this product has none");
    assert.ok(deps.insertCalls.length > 0, "generation should run for this product");
  });

  it("checkExistingPosts receives the correct productId as its first argument", async () => {
    const seenProductIds: number[] = [];

    const deps = makeDeps({
      checkExistingPosts: async (pid) => {
        seenProductIds.push(pid);
        return [];
      },
    });

    await generateScheduleForProduct(
      PRODUCT_ID,
      MONTH_KEY,
      { skipIfExists: true },
      deps,
    );

    assert.ok(
      seenProductIds.includes(PRODUCT_ID),
      `checkExistingPosts must be called with productId=${PRODUCT_ID}`,
    );
    assert.ok(
      !seenProductIds.includes(OTHER_PRODUCT),
      "checkExistingPosts must not be called with a different productId",
    );
  });
});

// ─── Suite 4: guard is scoped to the correct month ───────────────────────────

describe("generateScheduleForProduct – guard is keyed on monthKey", () => {
  it("does NOT skip when existing posts are for a different month", async () => {
    // Simulate correct implementation: posts only exist for OTHER_MONTH
    const deps = makeDeps({
      checkExistingPosts: async (_pid, mk) => {
        return mk === OTHER_MONTH ? [{ id: 77 }] : [];
      },
    });

    const result = await generateScheduleForProduct(
      PRODUCT_ID,
      MONTH_KEY,    // ← requesting MONTH_KEY, not OTHER_MONTH
      { skipIfExists: true },
      deps,
    );

    assert.notEqual(result.skipped, true, "must not skip when posts exist only in a different month");
  });

  it("checkExistingPosts receives the correct monthKey as its second argument", async () => {
    const seenMonthKeys: string[] = [];

    const deps = makeDeps({
      checkExistingPosts: async (_pid, mk) => {
        seenMonthKeys.push(mk);
        return [];
      },
    });

    await generateScheduleForProduct(
      PRODUCT_ID,
      MONTH_KEY,
      { skipIfExists: true },
      deps,
    );

    assert.ok(
      seenMonthKeys.includes(MONTH_KEY),
      `checkExistingPosts must be called with monthKey=${MONTH_KEY}`,
    );
  });
});

// ─── Suite 5: skipIfExists = false / omitted ─────────────────────────────────

describe("generateScheduleForProduct – skipIfExists disabled never checks existing posts", () => {
  it("does not call checkExistingPosts when skipIfExists is false", async () => {
    let checkCalls = 0;

    const deps = makeDeps({
      checkExistingPosts: async () => { checkCalls++; return [{ id: 1 }]; },
    });

    await generateScheduleForProduct(
      PRODUCT_ID,
      MONTH_KEY,
      { skipIfExists: false },
      deps,
    );

    assert.equal(checkCalls, 0, "checkExistingPosts must not be called when skipIfExists is false");
  });

  it("does not call checkExistingPosts when opts is omitted entirely", async () => {
    let checkCalls = 0;

    const deps = makeDeps({
      checkExistingPosts: async () => { checkCalls++; return [{ id: 1 }]; },
    });

    await generateScheduleForProduct(PRODUCT_ID, MONTH_KEY, {}, deps);

    assert.equal(checkCalls, 0, "checkExistingPosts must not be called when skipIfExists is omitted");
  });

  it("always runs generation regardless of pre-existing posts when skipIfExists is false", async () => {
    const deps = makeDeps({
      existingPosts: [{ id: 1 }, { id: 2 }],
    });

    // Even with existing posts, without skipIfExists the function must proceed
    await generateScheduleForProduct(
      PRODUCT_ID,
      MONTH_KEY,
      { skipIfExists: false },
      deps,
    );

    assert.ok(deps.deleteCalls.length > 0, "deletePosts should still run without skipIfExists");
    assert.ok(deps.insertCalls.length > 0, "insertPosts should still run without skipIfExists");
  });
});

// ─── Suite 6: product without a websiteUrl is always a no-op ─────────────────

describe("generateScheduleForProduct – no websiteUrl short-circuits everything", () => {
  it("returns { count: 0 } and calls nothing when product has no websiteUrl", async () => {
    let checkCalls  = 0;
    let deleteCalls = 0;
    let insertCalls = 0;

    const deps = makeDeps({
      fetchProduct: async () => ({ ...MOCK_PRODUCT, websiteUrl: null }),
      checkExistingPosts: async () => { checkCalls++;  return []; },
      deletePosts:        async () => { deleteCalls++; },
      insertPosts:        async () => { insertCalls++; },
    });

    const result = await generateScheduleForProduct(
      PRODUCT_ID,
      MONTH_KEY,
      { skipIfExists: true },
      deps,
    );

    assert.equal(result.count,  0, "count must be 0 when product has no websiteUrl");
    assert.equal(checkCalls,    0, "checkExistingPosts must not be called");
    assert.equal(deleteCalls,   0, "deletePosts must not be called");
    assert.equal(insertCalls,   0, "insertPosts must not be called");
  });
});
