import {
  pgTable,
  text,
  serial,
  integer,
  doublePrecision,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const visionItemsTable = pgTable("vision_items", {
  id: serial("id").primaryKey(),
  /** Owner of this vision item — null means legacy/unowned (treated as owner's) */
  userId: varchar("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  targetValue: doublePrecision("target_value"),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertVisionItemSchema = createInsertSchema(
  visionItemsTable,
).omit({ id: true });
export type InsertVisionItem = z.infer<typeof insertVisionItemSchema>;
export type VisionItem = typeof visionItemsTable.$inferSelect;
