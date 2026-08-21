import { pgTable, serial, text, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { productsTable } from "./products";

export const socialAccountsTable = pgTable("social_accounts", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // 'instagram' | 'linkedin'
  accessToken: text("access_token"),
  accountId: text("account_id"),      // IG user ID or LinkedIn org URN
  accountName: text("account_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const socialPostsTable = pgTable("social_posts", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),           // 'instagram' | 'linkedin'
  scheduledDate: date("scheduled_date").notNull(),
  status: text("status").notNull().default("pending_approval"),
  // 'pending_approval' | 'approved' | 'posted' | 'failed' | 'rejected'
  caption: text("caption"),
  hashtags: text("hashtags"),
  theme: text("theme"),
  imagePrompt: text("image_prompt"),
  imageUrl: text("image_url"),           // stored in object storage (AI-generated or user-uploaded)
  videoUrl: text("video_url"),           // user-supplied video link (YouTube, Vimeo, Reel, etc.)
  documentUrl: text("document_url"),     // user-uploaded PDF (stored in object storage, LinkedIn carousel)
  platformPostId: text("platform_post_id"),
  postUrl: text("post_url"),
  errorMessage: text("error_message"),
  generatedAt: timestamp("generated_at"),
  approvedAt: timestamp("approved_at"),
  postedAt: timestamp("posted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSocialAccountSchema = createInsertSchema(socialAccountsTable);
export const insertSocialPostSchema = createInsertSchema(socialPostsTable);
