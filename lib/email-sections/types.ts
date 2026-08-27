/** Shared email section types for builder + renderer (Phase 1). */

export const SECTION_TYPES = [
  "text",
  "heading",
  "image",
  "button",
  "divider",
  "spacer",
  "header",
  "footer",
  "imageText",
  "html",
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export type EmailSection = {
  id: string;
  type: SectionType;
  visible: boolean;
  savedSectionId?: number | null;
  content: Record<string, unknown>;
  style: Record<string, unknown>;
};

export function isEmailSection(value: unknown): value is EmailSection {
  if (!value || typeof value !== "object") return false;
  const s = value as EmailSection;
  return (
    typeof s.id === "string" &&
    typeof s.type === "string" &&
    SECTION_TYPES.includes(s.type as SectionType) &&
    typeof s.visible === "boolean" &&
    typeof s.content === "object" &&
    s.content !== null &&
    typeof s.style === "object" &&
    s.style !== null
  );
}

export function parseSectionsJson(raw: unknown): EmailSection[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (!raw.every(isEmailSection)) return null;
  return raw;
}
