/**
 * Pure helpers for the social-post schedule cron.
 *
 * No external dependencies — these can be unit-tested without module mocking
 * or a running database.
 */

// ── Skip gate ─────────────────────────────────────────────────────────────────

/**
 * Decides whether schedule generation should be skipped for a product.
 *
 * @param skipIfExists - the caller's opt-in flag
 * @param hasExisting  - whether posts already exist for the target month
 * @returns  `{ skipped: true, count: 0 }` when the run should be skipped,
 *           `null` when generation should proceed
 */
export function evaluateSkipGate(
  skipIfExists: boolean,
  hasExisting: boolean,
): { skipped: true; count: 0 } | null {
  if (skipIfExists && hasExisting) return { skipped: true, count: 0 };
  return null;
}

// ── Cron tally ────────────────────────────────────────────────────────────────

export type CronTotals = { generated: number; skipped: number; failed: number };

/**
 * Merges a single per-product generation result into the running cron totals.
 *
 * @param totals   - accumulated counts so far (not mutated)
 * @param result   - outcome from `generateScheduleForProduct`
 * @returns        - updated totals and whether this product was added to the
 *                   notification list (count > 0 means new posts were written)
 */
export function applyProductResult(
  totals: CronTotals,
  result: { skipped?: boolean; count: number },
): { totals: CronTotals; addedToNotificationList: boolean } {
  if (result.skipped) {
    return {
      totals: { ...totals, skipped: totals.skipped + 1 },
      addedToNotificationList: false,
    };
  }
  if (result.count > 0) {
    return {
      totals: { ...totals, generated: totals.generated + 1 },
      addedToNotificationList: true,
    };
  }
  return { totals, addedToNotificationList: false };
}

/**
 * Increments the `failed` counter for a product that threw during generation.
 */
export function applyProductFailure(totals: CronTotals): CronTotals {
  return { ...totals, failed: totals.failed + 1 };
}

// ── Month key ─────────────────────────────────────────────────────────────────

/**
 * Returns the "YYYY-MM" key for the calendar month immediately after `now`.
 * Used by both the cron and its tests to avoid duplicating the date arithmetic.
 */
export function getNextMonthKey(now: Date = new Date()): string {
  const nextM = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, "0")}`;
}
