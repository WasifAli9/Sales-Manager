import { pgTable, serial, integer, varchar, timestamp, unique, jsonb } from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { usersTable } from "./auth";

export const productAssignmentsTable = pgTable(
  "product_assignments",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    permissions: jsonb("permissions").$type<string[] | null>().default(null),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.productId, t.userId)],
);

export type ProductAssignment = typeof productAssignmentsTable.$inferSelect;
