import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const platformStatesTable = pgTable("platform_states", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => productsTable.id, {
    onDelete: "cascade",
  }),
  platform: text("platform").notNull(),
  stage: text("stage").notNull().default("not_started"),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  notes: text("notes"),
});

export const insertPlatformStateSchema = createInsertSchema(
  platformStatesTable,
).omit({ id: true });
export type InsertPlatformState = z.infer<typeof insertPlatformStateSchema>;
export type PlatformState = typeof platformStatesTable.$inferSelect;
