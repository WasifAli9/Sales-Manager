import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

/** Reusable section groups saved per product (copied on insert in Phase 1). */
export const emailSavedSectionsTable = pgTable("email_saved_sections", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").default("custom"),
  tags: jsonb("tags").$type<string[]>().default([]),
  sectionsJson: jsonb("sections_json").notNull().$type<unknown[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type EmailSavedSection = typeof emailSavedSectionsTable.$inferSelect;
export type InsertEmailSavedSection = typeof emailSavedSectionsTable.$inferInsert;
