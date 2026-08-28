import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractDomain,
  normalizeCompanyName,
  parseEmployeeCount,
} from "./companyNormalize.ts";
import {
  computePriorityScore,
  scoreCompanyAgainstIcp,
  scoreContactRelevance,
  tierFromPriority,
} from "./scoring.ts";

describe("companyNormalize", () => {
  it("normalizes company names", () => {
    assert.equal(normalizeCompanyName("Acme Cleaning Ltd."), "acme cleaning");
  });

  it("extracts domains", () => {
    assert.equal(extractDomain("https://www.example.com/about"), "example.com");
    assert.equal(extractDomain("example.co.uk"), "example.co.uk");
  });

  it("parses employee counts", () => {
    assert.equal(parseEmployeeCount("50-100"), 75);
    assert.equal(parseEmployeeCount("1,200"), 1200);
  });
});

describe("scoring", () => {
  it("scores ICP with hard exclusion", () => {
    const result = scoreCompanyAgainstIcp(
      { industry: "Software", employeeCount: 2, location: "UK" },
      {
        targetIndustries: ["Cleaning"],
        employeeMin: 20,
        employeeMax: 500,
        targetGeographies: ["UK"],
        positiveCharacteristics: [],
        negativeCharacteristics: [],
        hardExclusions: { employeeBelow: 5 },
      },
    );
    assert.equal(result.disqualified, true);
    assert.equal(result.totalScore, 0);
  });

  it("scores contact titles", () => {
    const result = scoreContactRelevance("Operations Director", ["Operations", "Owner"]);
    assert.ok(result.contactScore >= 70);
    assert.equal(result.estimatedDecisionRole, "director");
  });

  it("tiers priority scores", () => {
    assert.equal(tierFromPriority(85, false), "A");
    assert.equal(tierFromPriority(65, false), "B");
    assert.equal(tierFromPriority(45, false), "C");
    assert.equal(tierFromPriority(90, true), "Reject");
    assert.equal(computePriorityScore(100, 100, 100), 100);
  });
});
