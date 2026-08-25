import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStrategyDocument,
  getMissingStrategistAnalyses,
  selectLatestStrategistAnalyses,
} from "./strategyDocument.ts";

describe("strategy document readiness", () => {
  it("reports every strategist analysis that still needs to be completed", () => {
    assert.deepEqual(
      getMissingStrategistAnalyses([{ kind: "icp" }, { kind: "cadence" }]),
      ["competitors", "value_prop", "gtm"],
    );
  });

  it("treats all five analysis kinds as ready even when other analyses exist", () => {
    assert.deepEqual(
      getMissingStrategistAnalyses([
        { kind: "icp" },
        { kind: "competitors" },
        { kind: "value_prop" },
        { kind: "gtm" },
        { kind: "cadence" },
        { kind: "website" },
      ]),
      [],
    );
  });
});

describe("buildStrategyDocument", () => {
  it("creates a readable, ordered document from all strategist analyses", () => {
    const document = buildStrategyDocument(
      {
        name: "Closer",
        tagline: "A focused sales CRM",
        targetMarket: "Founder-led B2B SaaS teams",
      },
      [
        { kind: "cadence", content: { outreach: { angle: "Lead with a useful audit", dailyVolume: "20" } } },
        { kind: "icp", content: { persona: "Founder-led SaaS operator", pain: "Pipeline is inconsistent" } },
        { kind: "competitors", content: { wedge: "A calm, product-centric workflow" } },
        { kind: "value_prop", content: { valueProp: "Know the next best sales action" } },
        { kind: "gtm", content: { summary: "Start with direct founder outreach" } },
      ],
    );

    assert.match(document, /# Sales Strategy Document/);
    assert.match(document, /## Product Context/);
    assert.match(document, /## Ideal Customer Profile/);
    assert.match(document, /### Persona/);
    assert.match(document, /Founder-led SaaS operator/);
    assert.match(document, /## Competitive Landscape/);
    assert.match(document, /## Value Proposition and Offer/);
    assert.match(document, /## Go-to-Market Plan/);
    assert.match(document, /## Sales Cadence/);
    assert.ok(document.indexOf("Ideal Customer Profile") < document.indexOf("Sales Cadence"));
  });

  it("selects the newest analysis per kind when legacy duplicate rows exist", () => {
    const selected = selectLatestStrategistAnalyses([
      { id: 4, kind: "icp", content: { persona: "Older persona" }, createdAt: "2026-01-01T00:00:00.000Z" },
      { id: 9, kind: "icp", content: { persona: "Current persona" }, createdAt: "2026-02-01T00:00:00.000Z" },
      { id: 10, kind: "competitors", content: {}, createdAt: "2026-02-01T00:00:00.000Z" },
    ]);

    assert.equal(selected.get("icp")?.id, 9);
    assert.equal(selected.get("icp")?.content && (selected.get("icp")?.content as { persona: string }).persona, "Current persona");
  });

  it("uses the analysis ID as a deterministic tie-breaker", () => {
    const selected = selectLatestStrategistAnalyses([
      { id: 2, kind: "gtm", content: { summary: "First result" }, createdAt: "2026-02-01T00:00:00.000Z" },
      { id: 3, kind: "gtm", content: { summary: "Second result" }, createdAt: "2026-02-01T00:00:00.000Z" },
    ]);

    assert.equal(selected.get("gtm")?.id, 3);
  });
});