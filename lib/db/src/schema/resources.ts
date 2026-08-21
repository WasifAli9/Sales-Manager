import { pgTable, text, serial, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const resourcesTable = pgTable("resources", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("active"),
  monthlyCost: doublePrecision("monthly_cost"),
  automates: text("automates"),
  notes: text("notes"),
});

export const insertResourceSchema = createInsertSchema(resourcesTable).omit({
  id: true,
});
export type InsertResource = z.infer<typeof insertResourceSchema>;
export type Resource = typeof resourcesTable.$inferSelect;
