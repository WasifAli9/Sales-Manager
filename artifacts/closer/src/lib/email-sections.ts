/** Client-side email section types (mirrors lib/email-sections/types.ts). */

export const SECTION_TYPES = [
  "text", "heading", "image", "button", "divider", "spacer", "header", "footer", "imageText", "html",
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
