import { pgTable, serial, varchar, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * One row per (digest_type, digest_date) pair — used as an atomic idempotency lock
 * so only the first scheduler instance to win the INSERT actually sends the email.
 */
export const digestLogTable = pgTable("digest_log", {
  id: serial("id").primaryKey(),
  digestType: varchar("digest_type", { length: 64 }).notNull(),
  digestDate: varchar("digest_date", { length: 10 }).notNull(), // YYYY-MM-DD
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("digest_log_type_date_unique").on(t.digestType, t.digestDate),
]);
