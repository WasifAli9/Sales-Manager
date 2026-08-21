import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reflectionsTable = pgTable("reflections", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  wentWell: text("went_well"),
  wentWrong: text("went_wrong"),
  improvements: text("improvements"),
  exercise: text("exercise"),
  coachFeedback: text("coach_feedback"),
  energy: integer("energy").notNull().default(3),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertReflectionSchema = createInsertSchema(
  reflectionsTable,
).omit({ id: true, createdAt: true });
export type InsertReflection = z.infer<typeof insertReflectionSchema>;
export type Reflection = typeof reflectionsTable.$inferSelect;
