/**
 * Merges brand + design template + content into email-safe HTML.
 * Content (body copy) stays separate from design shells until render time.
 */
import { signatureContentHtml } from "./emailSignatureHtml";

const LOGO_MARKER = 'data-sequence-logo="1"';

export type BrandRenderInput = {
  brandName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  fontStack: string;
  signatureHtml?: string | null;
};

export type DesignRenderInput = {
  htmlShell: string | null;
  bodyHtml: string;
  brand: BrandRenderInput;
  /** When no shell, optionally inject a small logo tag at the top of the body. */
  injectLogoWhenNoTemplate?: boolean;
};

const DEFAULT_BRAND: Omit<BrandRenderInput, "brandName" | "logoUrl"> = {
  primaryColor: "#0F766E",
  secondaryColor: "#134E4A",
  accentColor: "#14B8A6",
  backgroundColor: "#FFFFFF",
  textColor: "#0F172A",
  fontStack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

export function defaultBrandColors(): typeof DEFAULT_BRAND {
  return { ...DEFAULT_BRAND };
}

/** Absolute-ize relative storage URLs for outbound email clients. */
export function absoluteAssetUrl(pathOrUrl: string | null | undefined, publicOrigin: string): string | null {
  if (!pathOrUrl?.trim()) return null;
  const value = pathOrUrl.trim();
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  const origin = publicOrigin.replace(/\/$/, "");
  return value.startsWith("/") ? `${origin}${value}` : `${origin}/${value}`;
}

/**
 * Insert a small logo block at the top of the body if not already present.
 * Used when a sequence has a logo but no design template (tag behavior).
 */
export function injectSequenceLogo(bodyHtml: string, logoUrl: string | null): string {
  if (!logoUrl?.trim()) return bodyHtml;
  if (bodyHtml.includes(LOGO_MARKER) || bodyHtml.includes(logoUrl)) return bodyHtml;
  const block =
    `<div ${LOGO_MARKER} style="margin:0 0 16px 0;">` +
    `<img src="${escapeAttr(logoUrl)}" alt="" width="120" style="display:block;max-width:120px;height:auto;border:0;" />` +
    `</div>`;
  return `${block}${bodyHtml}`;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function replaceAll(haystack: string, needle: string, replacement: string): string {
  return haystack.split(needle).join(replacement);
}

/**
 * Apply a design shell (or logo-only inject) to content HTML.
 * Shell must contain {{body}}. Other slots are optional.
 */
export function renderEmailDesign(input: DesignRenderInput): string {
  const { brand, bodyHtml } = input;
  const signature = signatureContentHtml(brand.signatureHtml);

  if (!input.htmlShell?.includes("{{body}}")) {
    const withLogo =
      input.injectLogoWhenNoTemplate !== false
        ? injectSequenceLogo(bodyHtml, brand.logoUrl)
        : bodyHtml;
    return withLogo;
  }

  let html = input.htmlShell;
  const slots: Record<string, string> = {
    "{{body}}": bodyHtml,
    "{{logo}}": brand.logoUrl
      ? `<img src="${escapeAttr(brand.logoUrl)}" alt="${escapeAttr(brand.brandName)}" width="140" style="display:block;max-width:140px;height:auto;border:0;" />`
      : "",
    "{{logoUrl}}": brand.logoUrl ?? "",
    "{{brandName}}": brand.brandName,
    "{{primaryColor}}": brand.primaryColor || DEFAULT_BRAND.primaryColor,
    "{{secondaryColor}}": brand.secondaryColor || DEFAULT_BRAND.secondaryColor,
    "{{accentColor}}": brand.accentColor || DEFAULT_BRAND.accentColor,
    "{{backgroundColor}}": brand.backgroundColor || DEFAULT_BRAND.backgroundColor,
    "{{textColor}}": brand.textColor || DEFAULT_BRAND.textColor,
    "{{fontStack}}": brand.fontStack || DEFAULT_BRAND.fontStack,
    "{{signature}}": signature,
  };

  for (const [key, value] of Object.entries(slots)) {
    html = replaceAll(html, key, value);
  }

  return html;
}

/** Strip em/en dashes from AI-generated shell sample copy. */
export function sanitizeDesignShell(html: string): string {
  return html
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/,\s*,+/g, ",")
    .replace(/\s{2,}/g, " ");
}
