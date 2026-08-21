/**
 * Tests for the scheduledFor timestamp validator.
 * Run with: pnpm --filter @workspace/api-server test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateScheduledFor } from "./validateScheduledFor.ts";

describe("validateScheduledFor", () => {
  // ── Rejection cases ────────────────────────────────────────────────────────

  it("returns 400 for undefined input", () => {
    const result = validateScheduledFor(undefined);
    assert.equal(result.ok, false);
    assert(!result.ok && result.status === 400);
  });

  it("returns 400 for null input", () => {
    const result = validateScheduledFor(null);
    assert.equal(result.ok, false);
    assert(!result.ok && result.status === 400);
  });

  it("returns 400 for a non-date string", () => {
    const result = validateScheduledFor("not-a-date");
    assert.equal(result.ok, false);
    assert(!result.ok && result.status === 400);
  });

  it("returns 422 for a timestamp in the past", () => {
    const past = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
    const result = validateScheduledFor(past);
    assert.equal(result.ok, false);
    assert(!result.ok && result.status === 422);
    assert(!result.ok && result.error === "scheduledFor must be a future timestamp");
  });

  it("returns 422 for the current moment (epoch-equal)", () => {
    // Freeze Date.now via a snapshot taken just before the call
    const now = new Date().toISOString();
    // By the time validateScheduledFor runs, Date.now() will be >= the parsed
    // value, so this should be rejected as not-strictly-future.
    const result = validateScheduledFor(now);
    assert.equal(result.ok, false);
    assert(!result.ok && result.status === 422);
  });

  // ── Acceptance cases ───────────────────────────────────────────────────────

  it("accepts a timestamp 30 seconds in the future", () => {
    const soon = new Date(Date.now() + 30_000).toISOString();
    const result = validateScheduledFor(soon);
    assert.equal(result.ok, true);
    assert(result.ok && result.date instanceof Date);
  });

  it("accepts a timestamp 1 minute in the future", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const result = validateScheduledFor(future);
    assert.equal(result.ok, true);
  });

  it("accepts a timestamp 24 hours in the future", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const result = validateScheduledFor(future);
    assert.equal(result.ok, true);
  });

  it("returns the parsed Date object on success", () => {
    const isoString = new Date(Date.now() + 3_600_000).toISOString();
    const result = validateScheduledFor(isoString);
    assert(result.ok);
    if (result.ok) {
      assert.equal(result.date.toISOString(), isoString);
    }
  });
});
