import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeFounderScore,
  estimateMinutes,
  priorityLevel,
  whyItMatters,
} from "./scoring.ts";

describe("founder priority engine", () => {
  it("bands scores correctly", () => {
    assert.equal(priorityLevel(90), "critical");
    assert.equal(priorityLevel(75), "high");
    assert.equal(priorityLevel(50), "medium");
    assert.equal(priorityLevel(49), "low");
  });

  it("weights revenue-first toward commercial/urgency", () => {
    const dims = {
      commercial: 100,
      probability: 50,
      urgency: 100,
      humanDependency: 20,
      risk: 20,
      strategic: 100,
    };
    const balanced = computeFounderScore(dims, false);
    const revenue = computeFounderScore(dims, true);
    assert.ok(revenue >= balanced);
  });

  it("estimates durations by execution/action", () => {
    assert.equal(estimateMinutes(null, "user_approves"), 5);
    assert.equal(estimateMinutes("call", "user_acts"), 30);
    assert.equal(estimateMinutes("re_engage", "ai_handles"), 0);
  });

  it("builds why-it-matters copy", () => {
    const text = whyItMatters({
      commercial: 80,
      urgency: 80,
      risk: 70,
      humanDependency: 80,
      title: "Deal X",
    });
    assert.match(text, /Deal X/);
    assert.match(text, /commercial|time-sensitive|risk|judgement/i);
  });
});
