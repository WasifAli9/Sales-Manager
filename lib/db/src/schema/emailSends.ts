import { pgTable, serial, text, integer, timestamp, uniqueIndex, index, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { leadsTable } from "./leads";
import { emailTemplatesTable } from "./emailTemplates";
import { emailSequencesTable, emailSequenceStepsTable } from "./emailSequences";

export const emailSendsTable = pgTable(
  "email_sends",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id")
      .references(() => leadsTable.id, { onDelete: "set null" }),
    templateId: integer("template_id").references(() => emailTemplatesTable.id, {
      onDelete: "set null",
    }),
    /** Groups all sends from a single bulk-schedule operation */
    batchId: text("batch_id"),
    toAddress: text("to_address").notNull(),
    /** The From address used when this email was sent/scheduled */
    fromAddress: text("from_address"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    // status: pending | sent | failed | scheduled | paused | cancelled
    status: text("status").notNull().default("pending"),
    resendId: text("resend_id"),
    /** RFC Message-ID from provider / headers for inbound thread matching. */
    rfcMessageId: text("rfc_message_id"),
    /** Plus-address token used in Reply-To (e.g. s123). */
    replyToToken: text("reply_to_token"),
    /** User who scheduled this send (for daily quota). */
    scheduledByUserId: varchar("scheduled_by_user_id"),
    /** Opaque token for the recipient's one-click unsubscribe link. */
    unsubscribeToken: text("unsubscribe_token"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    openCount: integer("open_count").notNull().default(0),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    lastClickedAt: timestamp("last_clicked_at", { withTimezone: true }),
    clickCount: integer("click_count").notNull().default(0),
    lastClickedUrl: text("last_clicked_url"),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    bounceType: text("bounce_type"),
    bounceMessage: text("bounce_message"),
    /** Populated when this send was created by a sequence enrollment */
    sequenceId: integer("sequence_id").references(() => emailSequencesTable.id, { onDelete: "set null" }),
    sequenceStepId: integer("sequence_step_id").references(() => emailSequenceStepsTable.id, { onDelete: "set null" }),
    /** A or B when the step had A/B testing enabled at schedule time. */
    abVariant: text("ab_variant"),
    /** Points to the original send when this is an automatic follow-up resend. */
    resendOfSendId: integer("resend_of_send_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    /**
     * Unique partial index: only one scheduled send per (lead, template) pair
     * at a time. The WHERE clause means the constraint is lifted as soon as
     * the status changes away from 'scheduled', allowing re-schedules.
     * template_id IS NOT NULL guard prevents the index from blocking
     * ad-hoc (no-template) sends to the same lead.
     */
    uniqueIndex("email_sends_no_dup_scheduled")
      .on(table.leadId, table.templateId)
      .where(
        sql`${table.status} = 'scheduled' AND ${table.templateId} IS NOT NULL`,
      ),
    index("email_sends_resend_id_idx").on(table.resendId),
    index("email_sends_rfc_message_id_idx").on(table.rfcMessageId),
    uniqueIndex("email_sends_unsubscribe_token_unique").on(table.unsubscribeToken),
  ],
);

export type EmailSend = typeof emailSendsTable.$inferSelect;
