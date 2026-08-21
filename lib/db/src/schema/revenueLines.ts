import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const revenueLinesTable = pgTable("revenue_lines", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  /** Price per unit sold on this revenue line (e.g. £1000/seat) */
  unitValue: numeric("unit_value", { precision: 14, scale: 4 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RevenueLine = typeof revenueLinesTable.$inferSelect;
