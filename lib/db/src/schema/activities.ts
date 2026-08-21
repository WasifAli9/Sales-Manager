import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  date,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { usersTable } from "./auth";

export const activitiesTable = pgTable("activities", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  productId: integer("product_id").references(() => productsTable.id, {
    onDelete: "cascade",
  }),
  platform: text("platform"),
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  effortMinutes: integer("effort_minutes").notNull().default(30),
  priority: integer("priority").notNull().default(2),
  status: text("status").notNull().default("pending"),
  delegateTo: text("delegate_to"),
  /** Linked user account for this delegated activity — used to filter Today for team members */
  assignedToUserId: varchar("assigned_to_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertActivitySchema = createInsertSchema(activitiesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activitiesTable.$inferSelect;
