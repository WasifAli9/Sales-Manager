/**
 * Unit tests for email section renderer.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coerceSections,
  renderSections,
  renderSectionsBodyFragment,
} from "./emailSectionRender.ts";

const brand = {
  brandName: "Acme Co",
  logoUrl: "https://app.example/logo.png",
  primaryColor: "#0F766E",
  secondaryColor: "#134E4A",
  accentColor: "#14B8A6",
  backgroundColor: "#FFFFFF",
  textColor: "#0F172A",
  fontStack: "Arial, sans-serif",
};

describe("coerceSections", () => {
  it("parses valid sections", () => {
    const raw = [{ id: "a", type: "text", visible: true, content: { html: "<p>Hi</p>" }, style: {} }];
    const parsed = coerceSections(raw);
    assert.equal(parsed?.length, 1);
    assert.equal(parsed?.[0]?.type, "text");
  });
});

describe("renderSections", () => {
  it("renders text and button blocks", () => {
    const sections = coerceSections([
      { id: "1", type: "text", visible: true, content: { html: "<p>Hello {{firstName}}</p>" }, style: {} },
      { id: "2", type: "button", visible: true, content: { label: "Go", url: "https://example.com" }, style: { alignment: "center" } },
    ])!;
    const html = renderSectionsBodyFragment(sections, brand);
    assert.match(html, /Hello/);
    assert.match(html, /Go/);
    assert.match(html, /example\.com/);
  });

  it("skips hidden sections", () => {
    const sections = coerceSections([
      { id: "1", type: "text", visible: false, content: { html: "<p>Hidden</p>" }, style: {} },
      { id: "2", type: "heading", visible: true, content: { text: "Visible" }, style: {} },
    ])!;
    const html = renderSectionsBodyFragment(sections, brand);
    assert.doesNotMatch(html, /Hidden/);
    assert.match(html, /Visible/);
  });

  it("strips script from html block", () => {
    const sections = coerceSections([
      { id: "1", type: "html", visible: true, content: { html: "<p>OK</p><script>alert(1)</script>" }, style: {} },
    ])!;
    const html = renderSectionsBodyFragment(sections, brand);
    assert.match(html, /OK/);
    assert.doesNotMatch(html, /script/i);
  });
});

describe("renderSections full document", () => {
  it("wraps in html document", () => {
    const sections = coerceSections([
      { id: "1", type: "spacer", visible: true, content: { height: 16 }, style: {} },
    ])!;
    const html = renderSections(sections, brand);
    assert.match(html, /<!DOCTYPE html>/);
  });
});
