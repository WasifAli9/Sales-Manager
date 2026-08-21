import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tagline: text("tagline"),
  description: text("description"),
  status: text("status").notNull().default("active"),
  targetMarket: text("target_market"),
  // Website intelligence (AI-captured)
  websiteUrl: text("website_url"),
  icp: text("icp"),
  valueProp: text("value_prop"),
  keyFeatures: text("key_features"),       // JSON array of strings
  pricingModel: text("pricing_model"),
  competitorLandscape: text("competitor_landscape"),
  linkedinFilter: text("linkedin_filter"),
  aiSummary: text("ai_summary"),
  /** Sender display name for outbound emails from this product (e.g. "Jane Smith") */
  fromName: text("from_name"),
  /** Sender email address — must be on a Resend-verified domain (e.g. "jane@acme.com") */
  fromEmail: text("from_email"),
  /** Plain-text or simple HTML email signature appended to every outbound email */
  emailSignature: text("email_signature"),
  /** Optional product-specific copy shown above the required unsubscribe link. */
  unsubscribeFooterText: text("unsubscribe_footer_text"),
  /** Label identifying the product or company in the unsubscribe footer. */
  unsubscribeSenderLabel: text("unsubscribe_sender_label"),
  /** Contact email displayed in the unsubscribe footer. */
  unsubscribeSupportEmail: text("unsubscribe_support_email"),
  /** Reusable AI brief for this product's email sequence generation */
  emailSequenceInstruction: text("email_sequence_instruction"),
  sortOrder: integer("sort_order").notNull().default(0),
  /** Last-used visual style guide for social image generation */
  socialImageStyle: text("social_image_style"),
  /** Preset id ("minimalist", "bold-vibrant", etc.) or "custom" for an uploaded reference */
  socialImageStylePreset: text("social_image_style_preset"),
  websiteAnalyzedAt: timestamp("website_analyzed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
