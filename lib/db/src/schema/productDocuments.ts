import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const productDocumentsTable = pgTable("product_documents", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // For text/paste documents — content stored directly
  textContent: text("text_content"),
  // For file uploads — object storage path returned by presigned upload
  storageKey: text("storage_key"),
  mimeType: text("mime_type"),
  fileSizeBytes: integer("file_size_bytes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
