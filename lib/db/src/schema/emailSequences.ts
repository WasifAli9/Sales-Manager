import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const emailSequencesTable = pgTable("email_sequences", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
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
  body: text("body").notNull(), // HTML rich text
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type EmailSequence = typeof emailSequencesTable.$inferSelect;
export type EmailSequenceStep = typeof emailSequenceStepsTable.$inferSelect;
