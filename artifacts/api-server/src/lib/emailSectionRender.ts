/**
 * Renders modular email sections to email-safe table HTML.
 */
import type { BrandRenderInput } from "./emailDesignRender.js";
import { absoluteAssetUrl } from "./emailDesignRender.js";

export type SectionType =
  | "text"
  | "heading"
  | "image"
  | "button"
  | "divider"
  | "spacer"
  | "header"
  | "footer"
  | "imageText"
  | "html";

export type EmailSection = {
  id: string;
  type: SectionType;
  visible: boolean;
  savedSectionId?: number | null;
  content: Record<string, unknown>;
  style: Record<string, unknown>;
};

const EMAIL_WIDTH = 600;

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeCustomHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

function pad(style: Record<string, unknown>): string {
  const t = num(style.paddingTop, num(style.padding, 16));
  const r = num(style.paddingRight, num(style.padding, 16));
  const b = num(style.paddingBottom, num(style.padding, 16));
  const l = num(style.paddingLeft, num(style.padding, 16));
  return `padding:${t}px ${r}px ${b}px ${l}px;`;
}

function align(style: Record<string, unknown>): string {
  const a = str(style.alignment, "left");
  return a === "center" || a === "right" ? a : "left";
}

function wrapSection(inner: string, style: Record<string, unknown>, brand: BrandRenderInput): string {
  const bg = str(style.backgroundColor, str(style.background, brand.backgroundColor));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${bg};">
<tr><td align="${align(style)}" style="${pad(style)}max-width:${EMAIL_WIDTH}px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${EMAIL_WIDTH}px;margin:0 auto;">
<tr><td>${inner}</td></tr>
</table>
</td></tr></table>`;
}

function renderText(section: EmailSection, brand: BrandRenderInput): string {
  const html = str(section.content.html, `<p style="color:${brand.textColor};font-family:${brand.fontStack};">${escapeHtml(str(section.content.text))}</p>`);
  return wrapSection(html, section.style, brand);
}

function renderHeading(section: EmailSection, brand: BrandRenderInput): string {
  const text = escapeHtml(str(section.content.text, "Heading"));
  const size = num(section.style.fontSize, 22);
  const color = str(section.style.color, brand.textColor);
  const inner = `<h2 style="margin:0;font-size:${size}px;line-height:1.3;color:${color};font-family:${brand.fontStack};font-weight:600;">${text}</h2>`;
  return wrapSection(inner, section.style, brand);
}

function renderImage(section: EmailSection, brand: BrandRenderInput, publicOrigin: string): string {
  let src = str(section.content.url, str(section.content.src));
  if (src && !src.startsWith("http") && !src.startsWith("data:")) {
    src = absoluteAssetUrl(src, publicOrigin) ?? src;
  }
  if (!src) return wrapSection("", section.style, brand);
  const alt = escapeHtml(str(section.content.alt));
  const width = num(section.content.width, 560);
  const link = str(section.content.linkUrl);
  const img = `<img src="${escapeHtml(src)}" alt="${alt}" width="${width}" style="display:block;max-width:100%;height:auto;border:0;border-radius:${num(section.style.borderRadius, 0)}px;" />`;
  const inner = link
    ? `<a href="${escapeHtml(link)}" target="_blank" style="text-decoration:none;">${img}</a>`
    : img;
  return wrapSection(inner, section.style, brand);
}

function renderButton(section: EmailSection, brand: BrandRenderInput): string {
  const label = escapeHtml(str(section.content.label, str(section.content.text, "Click here")));
  const url = str(section.content.url, "#");
  const bg = str(section.style.buttonColor, str(section.style.backgroundColor, brand.accentColor));
  const color = str(section.style.textColor, "#ffffff");
  const radius = num(section.style.borderRadius, 6);
  const inner = `<a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;background:${bg};color:${color};font-family:${brand.fontStack};font-size:16px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:${radius}px;">${label}</a>`;
  return wrapSection(inner, section.style, brand);
}

function renderDivider(section: EmailSection, brand: BrandRenderInput): string {
  const color = str(section.style.color, "#e2e8f0");
  const thickness = num(section.style.thickness, 1);
  const styleType = str(section.style.lineStyle, "solid");
  const inner = `<hr style="border:none;border-top:${thickness}px ${styleType} ${color};margin:0;" />`;
  return wrapSection(inner, section.style, brand);
}

function renderSpacer(section: EmailSection, brand: BrandRenderInput): string {
  const height = num(section.content.height, num(section.style.height, 24));
  return wrapSection(`<div style="height:${height}px;line-height:${height}px;font-size:1px;">&nbsp;</div>`, section.style, brand);
}

function renderHeader(section: EmailSection, brand: BrandRenderInput, publicOrigin: string): string {
  const variant = str(section.content.variant, "branded");
  const headline = escapeHtml(str(section.content.headline));
  const subtext = escapeHtml(str(section.content.subtext));
  let logoBlock = "";
  const logoUrl = str(section.content.logoUrl, brand.logoUrl ?? "");
  if (logoUrl && variant !== "personal") {
    const src = logoUrl.startsWith("http") || logoUrl.startsWith("data:")
      ? logoUrl
      : absoluteAssetUrl(logoUrl, publicOrigin) ?? logoUrl;
    logoBlock = `<img src="${escapeHtml(src)}" alt="${escapeHtml(brand.brandName)}" width="120" style="display:block;max-width:120px;height:auto;border:0;margin-bottom:12px;" />`;
  }
  const bg = str(section.style.backgroundColor, variant === "personal" ? brand.backgroundColor : brand.primaryColor);
  const textColor = str(section.style.color, variant === "personal" ? brand.textColor : "#ffffff");
  let inner = logoBlock;
  if (headline) inner += `<p style="margin:0 0 8px;font-size:20px;font-weight:600;color:${textColor};font-family:${brand.fontStack};">${headline}</p>`;
  if (subtext) inner += `<p style="margin:0;font-size:14px;color:${textColor};opacity:0.9;font-family:${brand.fontStack};">${subtext}</p>`;
  return wrapSection(inner || logoBlock, { ...section.style, backgroundColor: bg }, brand);
}

function renderFooter(section: EmailSection, brand: BrandRenderInput): string {
  const company = escapeHtml(str(section.content.companyName, brand.brandName));
  const address = escapeHtml(str(section.content.address));
  const website = str(section.content.website);
  const phone = escapeHtml(str(section.content.phone));
  const disclaimer = escapeHtml(str(section.content.disclaimer));
  const parts = [
    company ? `<p style="margin:0 0 4px;font-size:12px;color:${brand.textColor};font-family:${brand.fontStack};font-weight:600;">${company}</p>` : "",
    address ? `<p style="margin:0 0 4px;font-size:11px;color:#64748b;font-family:${brand.fontStack};">${address}</p>` : "",
    website ? `<p style="margin:0 0 4px;font-size:11px;"><a href="${escapeHtml(website)}" style="color:${brand.primaryColor};">${escapeHtml(website)}</a></p>` : "",
    phone ? `<p style="margin:0 0 4px;font-size:11px;color:#64748b;font-family:${brand.fontStack};">${phone}</p>` : "",
    disclaimer ? `<p style="margin:8px 0 0;font-size:10px;color:#94a3b8;font-family:${brand.fontStack};">${disclaimer}</p>` : "",
  ].filter(Boolean).join("");
  return wrapSection(parts, section.style, brand);
}

function renderImageText(section: EmailSection, brand: BrandRenderInput, publicOrigin: string): string {
  const layout = str(section.content.layout, "imageLeft");
  let src = str(section.content.imageUrl);
  if (src && !src.startsWith("http") && !src.startsWith("data:")) {
    src = absoluteAssetUrl(src, publicOrigin) ?? src;
  }
  const textHtml = str(section.content.textHtml, `<p style="color:${brand.textColor};font-family:${brand.fontStack};">${escapeHtml(str(section.content.text))}</p>`);
  const imgCell = src
    ? `<td width="48%" valign="top" style="padding:8px;"><img src="${escapeHtml(src)}" alt="" width="260" style="display:block;max-width:100%;height:auto;border:0;" /></td>`
    : `<td width="48%" valign="top" style="padding:8px;"></td>`;
  const textCell = `<td width="52%" valign="top" style="padding:8px;">${textHtml}</td>`;
  const row =
    layout === "imageRight"
      ? `<tr>${textCell}${imgCell}</tr>`
      : layout === "imageTop"
        ? `<tr><td colspan="2">${imgCell.replace(/<\/?td[^>]*>/g, "")}</td></tr><tr><td colspan="2">${textCell.replace(/<\/?td[^>]*>/g, "")}</td></tr>`
        : `<tr>${imgCell}${textCell}</tr>`;
  return wrapSection(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${row}</table>`, section.style, brand);
}

function renderHtml(section: EmailSection, brand: BrandRenderInput): string {
  const raw = sanitizeCustomHtml(str(section.content.html));
  return wrapSection(raw, section.style, brand);
}

function renderSection(section: EmailSection, brand: BrandRenderInput, publicOrigin: string): string {
  if (!section.visible) return "";
  switch (section.type) {
    case "text": return renderText(section, brand);
    case "heading": return renderHeading(section, brand);
    case "image": return renderImage(section, brand, publicOrigin);
    case "button": return renderButton(section, brand);
    case "divider": return renderDivider(section, brand);
    case "spacer": return renderSpacer(section, brand);
    case "header": return renderHeader(section, brand, publicOrigin);
    case "footer": return renderFooter(section, brand);
    case "imageText": return renderImageText(section, brand, publicOrigin);
    case "html": return renderHtml(section, brand);
    default: return "";
  }
}

export function renderSections(
  sections: EmailSection[],
  brand: BrandRenderInput,
  publicOrigin = "https://salesmanager.creativecloud.ai",
): string {
  const visible = sections.filter((s) => s.visible);
  if (!visible.length) return "";
  const inner = visible.map((s) => renderSection(s, brand, publicOrigin)).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${brand.backgroundColor};">
<center style="width:100%;background:${brand.backgroundColor};">
${inner}
</center></body></html>`;
}

/** Strip outer document wrapper for embedding in design template {{body}} slot. */
export function renderSectionsBodyFragment(
  sections: EmailSection[],
  brand: BrandRenderInput,
  publicOrigin?: string,
): string {
  const visible = sections.filter((s) => s.visible);
  return visible.map((s) => renderSection(s, brand, publicOrigin ?? "https://salesmanager.creativecloud.ai")).join("");
}

export function isValidSectionType(t: string): t is SectionType {
  return ["text", "heading", "image", "button", "divider", "spacer", "header", "footer", "imageText", "html"].includes(t);
}

export function coerceSections(raw: unknown): EmailSection[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out: EmailSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const s = item as EmailSection;
    if (typeof s.id !== "string" || !isValidSectionType(s.type)) return null;
    out.push({
      id: s.id,
      type: s.type,
      visible: s.visible !== false,
      savedSectionId: s.savedSectionId ?? null,
      content: (s.content && typeof s.content === "object") ? s.content as Record<string, unknown> : {},
      style: (s.style && typeof s.style === "object") ? s.style as Record<string, unknown> : {},
    });
  }
  return out;
}
