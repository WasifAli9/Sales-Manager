/**
 * Unit tests for email design render helpers.
 * Run: node --experimental-strip-types --test src/lib/emailDesignRender.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  absoluteAssetUrl,
  injectSequenceLogo,
  renderEmailDesign,
  sanitizeDesignShell,
} from "./emailDesignRender.ts";

describe("absoluteAssetUrl", () => {
  it("leaves absolute urls alone", () => {
    assert.equal(absoluteAssetUrl("https://cdn.example/x.png", "https://app.example"), "https://cdn.example/x.png");
  });

  it("prefixes relative storage paths", () => {
    assert.equal(
      absoluteAssetUrl("/api/storage/objects/logo.png", "https://app.example"),
      "https://app.example/api/storage/objects/logo.png",
    );
  });
});

describe("injectSequenceLogo", () => {
  it("prepends a logo block once", () => {
    const out = injectSequenceLogo("<p>Hi</p>", "https://app.example/logo.png");
    assert.match(out, /data-sequence-logo="1"/);
    assert.match(out, /Hi/);
    const again = injectSequenceLogo(out, "https://app.example/logo.png");
    assert.equal(again, out);
  });
});

describe("renderEmailDesign", () => {
  const brand = {
    brandName: "Acme",
    logoUrl: "https://app.example/logo.png",
    primaryColor: "#0F766E",
    secondaryColor: "#134E4A",
    accentColor: "#14B8A6",
    backgroundColor: "#FFFFFF",
    textColor: "#0F172A",
    fontStack: "Arial, sans-serif",
  };

  it("passes through body when no shell, injecting logo", () => {
    const html = renderEmailDesign({
      htmlShell: null,
      bodyHtml: "<p>Hello</p>",
      brand,
    });
    assert.match(html, /data-sequence-logo/);
    assert.match(html, /Hello/);
  });

  it("substitutes slots in a shell without mutating content copy", () => {
    const body = "<p>Unique body copy XYZ</p>";
    const html = renderEmailDesign({
      htmlShell: `<table><tr><td>{{logo}}</td></tr><tr><td style="color:{{primaryColor}}">{{body}}</td></tr></table>`,
      bodyHtml: body,
      brand,
    });
    assert.match(html, /Unique body copy XYZ/);
    assert.match(html, /logo\.png/);
    assert.match(html, /#0F766E/);
    assert.equal(html.includes("{{body}}"), false);
  });
});

describe("sanitizeDesignShell", () => {
  it("removes em dashes", () => {
    assert.equal(sanitizeDesignShell("Hello—world"), "Hello, world");
  });
});
