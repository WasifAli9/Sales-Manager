import { pgTable, serial, text, integer, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { emailSendsTable } from "./emailSends";

/**
 * Immutable provider event log for one outbound email.
 * The provider event ID is unique so webhook retries cannot double-count
 * deliveries, opens, clicks, or bounces.
 */
export const emailTrackingEventsTable = pgTable(
  "email_tracking_events",
  {
    id: serial("id").primaryKey(),
    emailSendId: integer("email_send_id")
      .notNull()
      .references(() => emailSendsTable.id, { onDelete: "cascade" }),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    clickUrl: text("click_url"),
    bounceType: text("bounce_type"),
    bounceMessage: text("bounce_message"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("email_tracking_events_provider_event_id_idx").on(table.providerEventId),
    index("email_tracking_events_email_send_id_idx").on(table.emailSendId),
    index("email_tracking_events_type_idx").on(table.eventType),
  ],
);

export type EmailTrackingEvent = typeof emailTrackingEventsTable.$inferSelect;