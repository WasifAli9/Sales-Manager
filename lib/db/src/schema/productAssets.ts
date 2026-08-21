import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const productAssetsTable = pgTable("product_assets", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** "logo" | "screenshot" | "other" */
  type: text("type").notNull().default("logo"),
  /** Relative API path e.g. /api/storage/objects/product-assets/… */
  storageUrl: text("storage_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ProductAsset = typeof productAssetsTable.$inferSelect;
export type InsertProductAsset = typeof productAssetsTable.$inferInsert;
