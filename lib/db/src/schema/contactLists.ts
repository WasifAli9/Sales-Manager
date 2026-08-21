import { pgTable, serial, text, integer, timestamp, varchar, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { usersTable } from "./auth";
import { leadsTable } from "./leads";

export const contactListsTable = pgTable("contact_lists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  createdByUserId: varchar("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const contactListMembersTable = pgTable(
  "contact_list_members",
  {
    id: serial("id").primaryKey(),
    listId: integer("list_id")
      .notNull()
      .references(() => contactListsTable.id, { onDelete: "cascade" }),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leadsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("contact_list_members_unique").on(table.listId, table.leadId),
    index("contact_list_members_list_idx").on(table.listId),
  ],
);

export const insertContactListSchema = createInsertSchema(contactListsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertContactList = z.infer<typeof insertContactListSchema>;
export type ContactList = typeof contactListsTable.$inferSelect;
export type ContactListMember = typeof contactListMembersTable.$inferSelect;