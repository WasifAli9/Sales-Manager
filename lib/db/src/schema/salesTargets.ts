import { pgTable, serial, integer, numeric, text, timestamp, unique } from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { revenueLinesTable } from "./revenueLines";

export const salesTargetsTable = pgTable(
  "sales_targets",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(), // 1–12
    revenueLine: text("revenue_line").notNull(),
    targetAmount: numeric("target_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    actualAmount: numeric("actual_amount", { precision: 14, scale: 2 }),
    notes: text("notes"),
    /** FK to the revenue_lines definition (null = legacy row entered directly) */
    revenueLineId: integer("revenue_line_id").references(() => revenueLinesTable.id, { onDelete: "cascade" }),
    /** Number of units sold/planned this month */
    unitVolume: numeric("unit_volume", { precision: 14, scale: 4 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [unique("sales_targets_unique").on(t.productId, t.year, t.month, t.revenueLine)],
);
