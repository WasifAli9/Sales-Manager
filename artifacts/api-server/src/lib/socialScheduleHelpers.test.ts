/**
 * Tests for the social-post schedule cron helpers.
 *
 * These helpers are pure functions with no external dependencies, so they run
 * directly under the Node built-in test runner without module mocking.
 *
 * Run with:
 *   pnpm --filter @workspace/api-server test:social
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSkipGate,
  applyProductResult,
  applyProductFailure,
  getNextMonthKey,
  sanitizeSocialCaption,
} from "./socialScheduleHelpers.ts";

// ── evaluateSkipGate ──────────────────────────────────────────────────────────

describe("evaluateSkipGate", () => {
  it("returns { skipped: true, count: 0 } when skipIfExists=true and posts exist", () => {
    const result = evaluateSkipGate(true, true);
    assert.deepEqual(result, { skipped: true, count: 0 });
  });

  it("returns null when skipIfExists=true but no posts exist (proceed with generation)", () => {
    const result = evaluateSkipGate(true, false);
    assert.equal(result, null);
  });

  it("returns null when skipIfExists=false even if posts exist", () => {
    const result = evaluateSkipGate(false, true);
    assert.equal(result, null);
  });

  it("returns null when both flags are false", () => {
    const result = evaluateSkipGate(false, false);
    assert.equal(result, null);
  });

  it("skip result is immutable — same reference returned every time gate fires", () => {
    const a = evaluateSkipGate(true, true);
    const b = evaluateSkipGate(true, true);
    assert.deepEqual(a, b);
    assert.equal(a?.skipped, true);
    assert.equal(a?.count, 0);
  });
});

// ── applyProductResult ────────────────────────────────────────────────────────

describe("applyProductResult", () => {
  const zero = { generated: 0, skipped: 0, failed: 0 };

  it("increments skipped when result.skipped is true", () => {
    const { totals, addedToNotificationList } = applyProductResult(
      zero,
      { skipped: true, count: 0 },
    );
    assert.equal(totals.skipped, 1);
    assert.equal(totals.generated, 0);
    assert.equal(totals.failed, 0);
    assert.equal(addedToNotificationList, false);
  });

  it("increments generated and flags notification list when count > 0", () => {
    const { totals, addedToNotificationList } = applyProductResult(
      zero,
      { count: 60 },
    );
    assert.equal(totals.generated, 1);
    assert.equal(totals.skipped, 0);
    assert.equal(totals.failed, 0);
    assert.equal(addedToNotificationList, true);
  });

  it("leaves totals unchanged and does NOT add to notification list when count === 0 and not skipped", () => {
    // Product had a website URL but the AI returned an empty calendar.
    const { totals, addedToNotificationList } = applyProductResult(
      zero,
      { count: 0 },
    );
    assert.deepEqual(totals, zero);
    assert.equal(addedToNotificationList, false);
  });

  it("does not mutate the input totals object", () => {
    const input = { generated: 1, skipped: 1, failed: 0 };
    const snapshot = { ...input };
    applyProductResult(input, { skipped: true, count: 0 });
    assert.deepEqual(input, snapshot, "input totals must not be mutated");
  });

  it("accumulates correctly across multiple sequential calls", () => {
    const results: Array<{ skipped?: boolean; count: number }> = [
      { skipped: true, count: 0 },  // product A – already had posts
      { skipped: true, count: 0 },  // product B – already had posts
      { count: 60 },                // product C – freshly generated
      { count: 0 },                 // product D – no AI posts returned
      { count: 30 },                // product E – freshly generated
    ];

    let totals = { generated: 0, skipped: 0, failed: 0 };
    let notified = 0;
    for (const r of results) {
      const out = applyProductResult(totals, r);
      totals = out.totals;
      if (out.addedToNotificationList) notified++;
    }

    assert.equal(totals.skipped,   2, "two products were skipped");
    assert.equal(totals.generated, 2, "two products were generated");
    assert.equal(totals.failed,    0, "no failures");
    assert.equal(notified,         2, "two products added to notification list");
  });

  // ── This is the core regression guard for the task ────────────────────────
  it("a product whose posts were already generated early is counted as skipped, not generated", () => {
    const { totals, addedToNotificationList } = applyProductResult(
      { generated: 0, skipped: 0, failed: 0 },
      // This is exactly what generateScheduleForProduct returns when
      // skipIfExists=true and posts already exist for next month.
      { skipped: true, count: 0 },
    );

    assert.equal(totals.skipped,   1, "early-generated product must increment skipped");
    assert.equal(totals.generated, 0, "must NOT increment generated");
    assert.equal(addedToNotificationList, false, "must NOT appear in notification email");
  });
});

// ── applyProductFailure ───────────────────────────────────────────────────────

describe("applyProductFailure", () => {
  it("increments failed and leaves other counters unchanged", () => {
    const result = applyProductFailure({ generated: 2, skipped: 1, failed: 0 });
    assert.equal(result.failed, 1);
    assert.equal(result.generated, 2);
    assert.equal(result.skipped, 1);
  });

  it("does not mutate the input", () => {
    const input = { generated: 0, skipped: 0, failed: 0 };
    const snapshot = { ...input };
    applyProductFailure(input);
    assert.deepEqual(input, snapshot);
  });
});

// ── getNextMonthKey ───────────────────────────────────────────────────────────

describe("getNextMonthKey", () => {
  it("returns YYYY-MM for the month after the supplied date", () => {
    assert.equal(getNextMonthKey(new Date("2026-08-16")), "2026-09");
    assert.equal(getNextMonthKey(new Date("2026-12-01")), "2027-01");
    assert.equal(getNextMonthKey(new Date("2025-11-30")), "2025-12");
  });

  it("pads single-digit months with a leading zero", () => {
    // January → February (month index 1, needs zero padding)
    assert.equal(getNextMonthKey(new Date("2026-01-15")), "2026-02");
    // August → September
    assert.equal(getNextMonthKey(new Date("2026-08-01")), "2026-09");
  });

  it("rolls over the year correctly at December", () => {
    assert.equal(getNextMonthKey(new Date("2026-12-31")), "2027-01");
  });

  it("returns a string matching /^\\d{4}-\\d{2}$/", () => {
    const key = getNextMonthKey(new Date("2026-08-16"));
    assert.match(key, /^\d{4}-\d{2}$/);
  });
});

// ── sanitizeSocialCaption ─────────────────────────────────────────────────────

describe("sanitizeSocialCaption", () => {
  it("replaces em dashes with a comma", () => {
    assert.equal(
      sanitizeSocialCaption("happier clients—and a clear audit trail"),
      "happier clients, and a clear audit trail",
    );
  });

  it("replaces en dashes with a comma", () => {
    assert.equal(
      sanitizeSocialCaption("Faster cover–calmer mornings"),
      "Faster cover, calmer mornings",
    );
  });

  it("leaves captions without dashes unchanged", () => {
    assert.equal(
      sanitizeSocialCaption("Replace ring-arounds with one broadcast."),
      "Replace ring-arounds with one broadcast.",
    );
  });
});
