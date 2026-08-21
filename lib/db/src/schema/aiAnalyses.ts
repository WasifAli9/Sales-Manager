import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const aiAnalysesTable = pgTable("ai_analyses", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  content: jsonb("content").notNull(),
  modelUsed: text("model_used").notNull(),
  grounded: boolean("grounded").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAiAnalysisSchema = createInsertSchema(aiAnalysesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAiAnalysis = z.infer<typeof insertAiAnalysisSchema>;
export type AiAnalysis = typeof aiAnalysesTable.$inferSelect;
