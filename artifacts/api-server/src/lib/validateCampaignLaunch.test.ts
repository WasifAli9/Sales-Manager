import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateScheduledFor } from "./validateScheduledFor.ts";

describe("campaign launch start validation", () => {
  it("rejects a past campaign start so it cannot be sent immediately", () => {
    const result = validateScheduledFor(new Date(Date.now() - 60_000).toISOString());

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 422);
      assert.match(result.error, /future timestamp/);
    }
  });

  it("accepts a valid future campaign start", () => {
    const result = validateScheduledFor(new Date(Date.now() + 60_000).toISOString());

    assert.equal(result.ok, true);
    if (result.ok) assert.ok(result.date.getTime() > Date.now());
  });
});