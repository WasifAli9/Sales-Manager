import { pgTable, serial, integer, numeric, text, timestamp, date } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const PIPELINE_STAGES = [
  "prospect",
  "qualified",
  "proposal",
  "negotiation",
  "closed_won",
  "closed_lost",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const pipelineDealsTable = pgTable("pipeline_deals", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  contactName: text("contact_name").notNull(),
  companyName: text("company_name"),
  value: numeric("value", { precision: 14, scale: 2 }).notNull().default("0"),
  stage: text("stage").notNull().default("prospect"),
  probability: integer("probability").notNull().default(50), // 0–100
  expectedCloseDate: date("expected_close_date"),
  currency: text("currency").notNull().default("USD"),
  frequency: text("frequency").notNull().default("monthly"), // monthly | annual
  notes: text("notes"),
  nextReviewDate: date("next_review_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const dealActivitiesTable = pgTable("deal_activities", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .references(() => pipelineDealsTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("note"), // note | call | email | meeting | demo
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ACTIVITY_KINDS = ["note", "call", "email", "meeting", "demo"] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
