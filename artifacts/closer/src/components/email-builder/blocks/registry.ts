/**
 * Default section definitions for the builder (mirrors server block types).
 */
import type { EmailSection, SectionType } from "@/lib/email-sections";

export function newSectionId(): string {
  return crypto.randomUUID();
}

export function createDefaultSection(type: SectionType): EmailSection {
  const id = newSectionId();
  const base = { id, type, visible: true, savedSectionId: null as number | null, style: { padding: 16, alignment: "left" as const } };
  switch (type) {
    case "text":
      return { ...base, content: { html: "<p>Write your message here.</p>" } };
    case "heading":
      return { ...base, content: { text: "Section heading" }, style: { ...base.style, fontSize: 22 } };
    case "image":
      return { ...base, content: { url: "", alt: "", linkUrl: "" }, style: { ...base.style, alignment: "center" } };
    case "button":
      return { ...base, content: { label: "Book a demo", url: "https://" }, style: { ...base.style, alignment: "center", buttonColor: "#14B8A6", textColor: "#ffffff" } };
    case "divider":
      return { ...base, content: {}, style: { padding: 8, color: "#e2e8f0", thickness: 1, lineStyle: "solid" } };
    case "spacer":
      return { ...base, content: { height: 24 }, style: { padding: 0 } };
    case "header":
      return { ...base, content: { variant: "branded", headline: "", subtext: "" }, style: { ...base.style, alignment: "left" } };
    case "footer":
      return { ...base, content: { companyName: "", address: "", website: "", phone: "", disclaimer: "" }, style: { ...base.style, alignment: "center" } };
    case "imageText":
      return { ...base, content: { layout: "imageLeft", imageUrl: "", textHtml: "<p>Your content here.</p>" } };
    case "html":
      return { ...base, content: { html: "<p>Custom HTML block</p>" } };
    default:
      return { ...base, content: { html: "" } };
  }
}

export const STARTER_SECTIONS: Array<{ name: string; category: string; description: string; sections: EmailSection[] }> = [
  {
    name: "Minimal header",
    category: "branding",
    description: "Small logo header for lightly branded emails",
    sections: [{
      ...createDefaultSection("header"),
      content: { variant: "minimal", headline: "", subtext: "" },
    }],
  },
  {
    name: "Standard CTA",
    category: "conversion",
    description: "Centered call-to-action button",
    sections: [{
      ...createDefaultSection("button"),
      content: { label: "See how it works", url: "https://" },
      style: { padding: 16, alignment: "center", buttonColor: "#14B8A6", textColor: "#ffffff" },
    }],
  },
  {
    name: "Corporate footer",
    category: "branding",
    description: "Company name and compliance line",
    sections: [{
      ...createDefaultSection("footer"),
      content: {
        companyName: "{{brandName}}",
        address: "",
        website: "",
        phone: "",
        disclaimer: "You received this email because you opted in or we believe this is relevant to your role.",
      },
    }],
  },
];

export const SECTION_CATALOG: Array<{ type: SectionType; label: string; group: string }> = [
  { type: "text", label: "Text", group: "Basic" },
  { type: "heading", label: "Heading", group: "Basic" },
  { type: "image", label: "Image", group: "Basic" },
  { type: "button", label: "Button", group: "Basic" },
  { type: "divider", label: "Divider", group: "Basic" },
  { type: "spacer", label: "Spacer", group: "Basic" },
  { type: "imageText", label: "Image + Text", group: "Basic" },
  { type: "header", label: "Header", group: "Branding" },
  { type: "footer", label: "Footer", group: "Branding" },
  { type: "html", label: "Custom HTML", group: "Advanced" },
];
