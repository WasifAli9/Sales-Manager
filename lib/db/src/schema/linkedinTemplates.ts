import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/** LinkedIn message templates: connection-request notes or direct messages */
export const linkedinTemplatesTable = pgTable("linkedin_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /** "connection" = connection-request note | "message" = direct message / InMail */
  type: text("type").notNull().default("message"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type LinkedInTemplate = typeof linkedinTemplatesTable.$inferSelect;
