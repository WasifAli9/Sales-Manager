import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { productAssetsTable } from "./productAssets";

/** Per-product email brand identity (logo + colours). Separate from design templates and copy. */
export const emailBrandProfilesTable = pgTable(
  "email_brand_profiles",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    logoAssetId: integer("logo_asset_id").references(() => productAssetsTable.id, {
      onDelete: "set null",
    }),
    primaryColor: text("primary_color").default("#0F766E"),
    secondaryColor: text("secondary_color").default("#134E4A"),
    accentColor: text("accent_color").default("#14B8A6"),
    backgroundColor: text("background_color").default("#FFFFFF"),
    textColor: text("text_color").default("#0F172A"),
    fontStack: text("font_stack").default(
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("email_brand_profiles_product_uidx").on(table.productId)],
);

export type EmailBrandProfile = typeof emailBrandProfilesTable.$inferSelect;
export type InsertEmailBrandProfile = typeof emailBrandProfilesTable.$inferInsert;
