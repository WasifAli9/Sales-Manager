import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

/**
 * Reusable HTML design shells for a product.
 * Must include {{body}}; may include {{logo}}, {{brandName}}, colour slots, etc.
 * Content (subject/body copy) stays on sequence steps — not in the shell.
 */
export const emailDesignTemplatesTable = pgTable("email_design_templates", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** plain | light | branded | custom */
  category: text("category").notNull().default("custom"),
  /** 1 = personal/plain, 2 = lightly branded, 3 = branded */
  designIntensity: integer("design_intensity").notNull().default(1),
  htmlShell: text("html_shell").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type EmailDesignTemplate = typeof emailDesignTemplatesTable.$inferSelect;
export type InsertEmailDesignTemplate = typeof emailDesignTemplatesTable.$inferInsert;
