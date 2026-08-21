import { index, integer, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { leadsTable } from "./leads";

export const leadTagsTable = pgTable(
  "lead_tags",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 64 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("lead_tags_normalized_name_unique").on(table.normalizedName)],
);

export const leadTagAssignmentsTable = pgTable(
  "lead_tag_assignments",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => leadTagsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("lead_tag_assignments_unique").on(table.leadId, table.tagId),
    index("lead_tag_assignments_lead_idx").on(table.leadId),
    index("lead_tag_assignments_tag_idx").on(table.tagId),
  ],
);

export const insertLeadTagSchema = createInsertSchema(leadTagsTable).omit({
  id: true,
  createdAt: true,
  normalizedName: true,
});
export type InsertLeadTag = z.infer<typeof insertLeadTagSchema>;
export type LeadTag = typeof leadTagsTable.$inferSelect;
export type LeadTagAssignment = typeof leadTagAssignmentsTable.$inferSelect;