import { pgTable, serial, text, integer, timestamp, varchar, uniqueIndex } from "drizzle-orm/pg-core";
import { emailSequencesTable } from "./emailSequences";
import { contactListsTable } from "./contactLists";
import { usersTable } from "./auth";

export const emailCampaignsTable = pgTable(
  "email_campaigns",
  {
    id: serial("id").primaryKey(),
    batchId: text("batch_id").notNull(),
    name: text("name").notNull(),
    sequenceId: integer("sequence_id").references(() => emailSequencesTable.id, { onDelete: "set null" }),
    contactListId: integer("contact_list_id").references(() => contactListsTable.id, { onDelete: "set null" }),
    createdByUserId: varchar("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("email_campaigns_batch_id_unique").on(table.batchId)],
);

export type EmailCampaign = typeof emailCampaignsTable.$inferSelect;