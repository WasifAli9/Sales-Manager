import { serial, text, integer, timestamp, varchar } from "drizzle-orm/pg-core"
import { pgTable } from "drizzle-orm/pg-core"
import { createInsertSchema } from "drizzle-zod"
import { usersTable } from "./auth"

export const teamMembersTable = pgTable("team_members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  focus: text("focus"),          // e.g. "sales", "marketing", "engineering"
  hoursPerWeek: integer("hours_per_week"),
  notes: text("notes"),
  /** FK to users.id — set when the owner creates a login for this team member */
  userId: varchar("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  /** Email invited with (stored for display even before account is created) */
  inviteEmail: text("invite_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const insertTeamMemberSchema = createInsertSchema(teamMembersTable).omit({
  id: true,
  createdAt: true,
})

export type TeamMember = typeof teamMembersTable.$inferSelect
export type InsertTeamMember = typeof teamMembersTable.$inferInsert
