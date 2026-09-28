/**
 * Unit tests for lead list select-next helpers.
 *
 * Run with:
 *   node --experimental-strip-types --test src/lib/leadListQueryHelpers.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SELECT_NEXT_DEFAULT,
  SELECT_NEXT_MAX,
  SELECT_NEXT_PRESETS,
  mergeSelectedIds,
  parseExcludeIds,
  parseSelectNextLimit,
} from "./leadListQueryHelpers.ts";

describe("parseSelectNextLimit", () => {
  it("accepts preset values 10, 25, 50, 100", () => {
    for (const n of SELECT_NEXT_PRESETS) {
      assert.equal(parseSelectNextLimit(n), n);
      assert.equal(parseSelectNextLimit(String(n)), n);
    }
  });

  it("defaults conceptually to 50 (constant)", () => {
    assert.equal(SELECT_NEXT_DEFAULT, 50);
  });

  it("rejects 0, negative, non-numeric, and over max", () => {
    assert.equal(parseSelectNextLimit(0), null);
    assert.equal(parseSelectNextLimit(-1), null);
    assert.equal(parseSelectNextLimit("abc"), null);
    assert.equal(parseSelectNextLimit(undefined), null);
    assert.equal(parseSelectNextLimit(SELECT_NEXT_MAX + 1), null);
  });

  it("accepts the maximum allowed value", () => {
    assert.equal(parseSelectNextLimit(SELECT_NEXT_MAX), SELECT_NEXT_MAX);
  });
});

describe("parseExcludeIds", () => {
  it("returns unique positive integers", () => {
    assert.deepEqual(parseExcludeIds([1, 2, 2, "3", 0, -5, "x", 4.5]), [1, 2, 3]);
  });

  it("returns empty array for non-arrays", () => {
    assert.deepEqual(parseExcludeIds(null), []);
    assert.deepEqual(parseExcludeIds("1,2"), []);
  });
});

describe("mergeSelectedIds", () => {
  it("appends next ids without duplicates", () => {
    assert.deepEqual(mergeSelectedIds([1, 2, 3], [3, 4, 5]), [1, 2, 3, 4, 5]);
  });

  it("supports repeated select-next batches", () => {
    const first = mergeSelectedIds([], [1, 2, 3]);
    const second = mergeSelectedIds(first, [4, 5]);
    assert.deepEqual(second, [1, 2, 3, 4, 5]);
    assert.equal(second.length, 5);
  });

  it("preserves manually selected ids when merging next batch", () => {
    assert.deepEqual(mergeSelectedIds([10, 20], [1, 2, 3]), [10, 20, 1, 2, 3]);
  });
});
