import { boolean, date, integer, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

/** Singleton org-wide outbound email throttle settings (row id = 1). */
export const orgEmailSendSettingsTable = pgTable("org_email_send_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  /** Target max emails per team member per day. */
  dailyMax: integer("daily_max").notNull().default(100),
  /** When set and < dailyMax, each member gets a random cap in [dailyMin, dailyMax] per day. */
  dailyMin: integer("daily_min"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userEmailDailyQuotasTable = pgTable(
  "user_email_daily_quotas",
  {
    id: serial("id").primaryKey(),
    userId: varchar("user_id").notNull(),
    quotaDate: date("quota_date").notNull(),
    allowedCount: integer("allowed_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("user_email_daily_quotas_user_date_uidx").on(t.userId, t.quotaDate)],
);
