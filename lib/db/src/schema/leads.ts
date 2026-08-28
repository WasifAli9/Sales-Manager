import { pgTable, serial, integer, text, timestamp, varchar, index } from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { usersTable } from "./auth";

export const leadsStatusEnum = [
  "new",
  "contacted",
  "qualified",
  "not_interested",
  "converted",
] as const;
export type LeadStatus = (typeof leadsStatusEnum)[number];

export const leadActionTypeEnum = [
  "call",
  "email",
  "linkedin",
  "meeting",
  "sms",
] as const;
export type LeadActionType = (typeof leadActionTypeEnum)[number];

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  email: text("email"),
  company: text("company"),
  title: text("title"),
  phone: text("phone"),
  linkedinUrl: text("linkedin_url"),
  companyLinkedinUrl: text("company_linkedin_url"),
  instagramUrl: text("instagram_url"),
  facebookUrl: text("facebook_url"),
  tiktokUrl: text("tiktok_url"),
  address: text("address"),
  apolloId: text("apollo_id"),
  status: text("status").notNull().default("new"),
  /** FK to companies after Apollo normalize/dedupe. */
  companyId: integer("company_id"),
  /** queued | researching | scored | failed | skipped | null */
  researchStatus: text("research_status"),
  lastActionType: text("last_action_type"),
  lastActionNote: text("last_action_note"),
  lastActionAt: timestamp("last_action_at", { withTimezone: true }),
  notes: text("notes"),
  /** end_user = direct buyer, reseller = channel/distribution partner, null = unclassified */
  leadType: text("lead_type"),
  /** Team member this lead is assigned to — null = unassigned (owner sees all) */
  assignedToUserId: varchar("assigned_to_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  /** Global marketing-email suppression set through a recipient unsubscribe link. */
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  unsubscribeSource: text("unsubscribe_source"),
}, (table) => [
  index("leads_unsubscribed_at_idx").on(table.unsubscribedAt),
]);
