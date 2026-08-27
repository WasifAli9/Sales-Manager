import { pgTable, serial, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { productAssetsTable } from "./productAssets";
import { emailDesignTemplatesTable } from "./emailDesignTemplates";

export const emailSequencesTable = pgTable("email_sequences", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  /** Optional logo override for this sequence (falls back to brand profile logo). */
  logoAssetId: integer("logo_asset_id").references(() => productAssetsTable.id, {
    onDelete: "set null",
  }),
  /** Uniform design template for all steps unless a step overrides. */
  designTemplateId: integer("design_template_id").references(() => emailDesignTemplatesTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const emailSequenceStepsTable = pgTable("email_sequence_steps", {
  id: serial("id").primaryKey(),
  sequenceId: integer("sequence_id")
    .notNull()
    .references(() => emailSequencesTable.id, { onDelete: "cascade" }),
  /** 1-based display order */
  position: integer("position").notNull(),
  /** Days from enrollment date when this email should send (0 = same day) */
  delayDays: integer("delay_days").notNull().default(0),
  /** Optional human-friendly step name, e.g. "Initial outreach" */
  name: text("name"),
  subject: text("subject").notNull(),
  body: text("body").notNull(), // Rendered HTML cache; source may be sectionsJson
  /** Modular section builder source of truth when present. */
  sectionsJson: jsonb("sections_json").$type<unknown[]>(),
  /** Per-step design override; null inherits sequence.designTemplateId */
  designTemplateId: integer("design_template_id").references(() => emailDesignTemplatesTable.id, {
    onDelete: "set null",
  }),
  abTestEnabled: boolean("ab_test_enabled").notNull().default(false),
  abTestSplitPercent: integer("ab_test_split_percent").notNull().default(50),
  subjectVariantB: text("subject_variant_b"),
  bodyVariantB: text("body_variant_b"),
  sectionsJsonVariantB: jsonb("sections_json_variant_b").$type<unknown[]>(),
  /** Schedule a follow-up if the recipient has not opened after N hours. */
  resendIfUnopened: boolean("resend_if_unopened").notNull().default(false),
  resendAfterHours: integer("resend_after_hours").notNull().default(48),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type EmailSequence = typeof emailSequencesTable.$inferSelect;
export type EmailSequenceStep = typeof emailSequenceStepsTable.$inferSelect;
