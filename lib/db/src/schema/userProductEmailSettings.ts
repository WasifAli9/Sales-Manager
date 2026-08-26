import { pgTable, serial, text, integer, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { usersTable } from "./auth";

/**
 * Per-user sender identity for a product.
 * Team members configure their own From / signature / unsubscribe copy here
 * instead of inheriting the product owner's settings.
 */
export const userProductEmailSettingsTable = pgTable(
  "user_product_email_settings",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    fromName: text("from_name"),
    fromEmail: text("from_email"),
    emailSignature: text("email_signature"),
    unsubscribeFooterText: text("unsubscribe_footer_text"),
    unsubscribeSenderLabel: text("unsubscribe_sender_label"),
    unsubscribeSupportEmail: text("unsubscribe_support_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("user_product_email_settings_user_product_uidx").on(table.userId, table.productId),
  ],
);

export type UserProductEmailSettings = typeof userProductEmailSettingsTable.$inferSelect;
export type InsertUserProductEmailSettings = typeof userProductEmailSettingsTable.$inferInsert;
