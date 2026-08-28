import { pgTable, serial, integer, numeric, text, timestamp, date, varchar } from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { leadsTable } from "./leads";
import { usersTable } from "./auth";

export const PIPELINE_STAGES = [
  "interested",
  "discovery",
  "demo",
  "qualified",
  "proposal",
  "decision",
  "negotiation",
  "won",
  "lost",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const CLOSED_STAGES = ["won", "lost"] as const;

export const pipelineDealsTable = pgTable("pipeline_deals", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  leadId: integer("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  companyId: integer("company_id"),
  ownerUserId: varchar("owner_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  contactName: text("contact_name").notNull(),
  companyName: text("company_name"),
  value: numeric("value", { precision: 14, scale: 2 }).notNull().default("0"),
  stage: text("stage").notNull().default("interested"),
  probability: integer("probability").notNull().default(20),
  health: text("health").default("healthy"),
  source: text("source"),
  sourceInboundId: integer("source_inbound_id"),
  sequenceId: integer("sequence_id"),
  mrr: numeric("mrr", { precision: 14, scale: 2 }),
  arr: numeric("arr", { precision: 14, scale: 2 }),
  expectedCloseDate: date("expected_close_date"),
  currency: text("currency").notNull().default("USD"),
  frequency: text("frequency").notNull().default("monthly"),
  notes: text("notes"),
  nextReviewDate: date("next_review_date"),
  lostReason: text("lost_reason"),
  wonAt: timestamp("won_at", { withTimezone: true }),
  lostAt: timestamp("lost_at", { withTimezone: true }),
  attentionScore: integer("attention_score").default(0),
  lastEngagementAt: timestamp("last_engagement_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const dealActivitiesTable = pgTable("deal_activities", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id")
    .notNull()
    .references(() => pipelineDealsTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("note"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ACTIVITY_KINDS = [
  "note",
  "call",
  "email",
  "meeting",
  "demo",
  "reply",
  "stage_change",
  "system",
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
