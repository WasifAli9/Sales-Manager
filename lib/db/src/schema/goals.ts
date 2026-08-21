import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  date,
  doublePrecision,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { resourcesTable } from "./resources";
import { usersTable } from "./auth";

export const goalsTable = pgTable("goals", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => productsTable.id, {
    onDelete: "cascade",
  }),
  platform: text("platform"),
  resourceId: integer("resource_id").references(() => resourcesTable.id, {
    onDelete: "cascade",
  }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  metric: text("metric").notNull(),
  targetValue: doublePrecision("target_value").notNull(),
  currentValue: doublePrecision("current_value").notNull().default(0),
  unit: text("unit").notNull(),
  deadline: date("deadline", { mode: "string" }),
  /** If set, this goal is assigned to a team member — they can view but not edit it */
  assignedToUserId: varchar("assigned_to_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertGoalSchema = createInsertSchema(goalsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Goal = typeof goalsTable.$inferSelect;
