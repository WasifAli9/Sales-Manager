import { sql } from "drizzle-orm";
import { pgTable, varchar, text, timestamp, integer } from "drizzle-orm/pg-core";
import { teamMembersTable } from "./team";

export const teamInviteTokensTable = pgTable("team_invite_tokens", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  teamMemberId: integer("team_member_id")
    .notNull()
    .references(() => teamMembersTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  accountRole: varchar("account_role").notNull().default("member"),
  tokenHash: varchar("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TeamInviteToken = typeof teamInviteTokensTable.$inferSelect;
