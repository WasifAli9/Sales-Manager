import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const emailTemplatesTable = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  subject: text("subject").notNull(),
  body: text("body").notNull(), // HTML or plain text; supports {{firstName}} etc.
  isFollowUp: boolean("is_follow_up").notNull().default(false),
  followUpDelayDays: integer("follow_up_delay_days"), // days after last contact; null = not auto-scheduled
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type EmailTemplate = typeof emailTemplatesTable.$inferSelect;
