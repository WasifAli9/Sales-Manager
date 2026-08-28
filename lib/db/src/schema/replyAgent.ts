import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
  jsonb,
  varchar,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { leadsTable } from "./leads";
import { emailSendsTable } from "./emailSends";
import { emailSequencesTable } from "./emailSequences";
import { companiesTable } from "./leadIntelligence";

export const inboundMessagesTable = pgTable(
  "inbound_messages",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
    leadId: integer("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
    companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "set null" }),
    sequenceId: integer("sequence_id").references(() => emailSequencesTable.id, { onDelete: "set null" }),
    outboundSendId: integer("outbound_send_id").references(() => emailSendsTable.id, { onDelete: "set null" }),
    threadId: text("thread_id"),
    externalEmailId: text("external_email_id"),
    externalMessageId: text("external_message_id"),
    subject: text("subject"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    sender: text("sender").notNull(),
    recipient: text("recipient"),
    headersJson: jsonb("headers_json").$type<Record<string, string>>(),
    matchMethod: text("match_method"),
    /** pending | classified | actioned | failed | needs_attention */
    processingStatus: text("processing_status").notNull().default("pending"),
    /** needs_attention | ai_handled | interested | follow_up | not_interested | unsubscribed | ooo | all */
    inboxBucket: text("inbox_bucket").notNull().default("all"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("inbound_messages_external_email_uidx").on(table.externalEmailId),
    index("inbound_messages_product_received_idx").on(table.productId, table.receivedAt),
    index("inbound_messages_lead_idx").on(table.leadId),
    index("inbound_messages_bucket_idx").on(table.inboxBucket),
  ],
);

export const replyAnalysesTable = pgTable(
  "reply_analyses",
  {
    id: serial("id").primaryKey(),
    inboundMessageId: integer("inbound_message_id")
      .notNull()
      .references(() => inboundMessagesTable.id, { onDelete: "cascade" }),
    classification: text("classification").notNull(),
    confidence: integer("confidence").notNull().default(0),
    sentiment: text("sentiment"),
    buyingIntent: text("buying_intent"),
    summary: text("summary"),
    objectionType: text("objection_type"),
    requestedAction: text("requested_action"),
    recommendedAction: text("recommended_action"),
    requiresResponse: boolean("requires_response").notNull().default(true),
    requiresApproval: boolean("requires_approval").notNull().default(true),
    followUpDays: integer("follow_up_days"),
    returnDate: text("return_date"),
    rawAiJson: jsonb("raw_ai_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("reply_analyses_inbound_uidx").on(table.inboundMessageId)],
);

export const aiReplyDraftsTable = pgTable(
  "ai_reply_drafts",
  {
    id: serial("id").primaryKey(),
    inboundMessageId: integer("inbound_message_id")
      .notNull()
      .references(() => inboundMessagesTable.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    subject: text("subject"),
    /** draft | awaiting_approval | approved | sent | cancelled */
    status: text("status").notNull().default("draft"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    editedByUser: varchar("edited_by_user"),
    outboundSendId: integer("outbound_send_id").references(() => emailSendsTable.id, {
      onDelete: "set null",
    }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("ai_reply_drafts_inbound_idx").on(table.inboundMessageId)],
);

export const followUpsTable = pgTable(
  "follow_ups",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").references(() => productsTable.id, { onDelete: "cascade" }),
    leadId: integer("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
    inboundMessageId: integer("inbound_message_id").references(() => inboundMessagesTable.id, {
      onDelete: "set null",
    }),
    threadId: text("thread_id"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    reason: text("reason"),
    /** pending | due | done | cancelled */
    status: text("status").notNull().default("pending"),
    createdBy: text("created_by").notNull().default("ai"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("follow_ups_scheduled_idx").on(table.status, table.scheduledAt)],
);

export const productAiReplySettingsTable = pgTable(
  "product_ai_reply_settings",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    autoProcessReplies: boolean("auto_process_replies").notNull().default(true),
    autoPauseOnReply: boolean("auto_pause_on_reply").notNull().default(true),
    autoSendHighConfidence: boolean("auto_send_high_confidence").notNull().default(false),
    autoHandleOoo: boolean("auto_handle_ooo").notNull().default(true),
    autoHandleUnsubscribe: boolean("auto_handle_unsubscribe").notNull().default(true),
    autoHandleNotInterested: boolean("auto_handle_not_interested").notNull().default(true),
    autoAnswerProductQuestions: boolean("auto_answer_product_questions").notNull().default(false),
    autoAnswerPricing: boolean("auto_answer_pricing").notNull().default(false),
    autoSendMeetingLink: boolean("auto_send_meeting_link").notNull().default(false),
    minConfidenceAutoSend: integer("min_confidence_auto_send").notNull().default(95),
    minConfidenceDraft: integer("min_confidence_draft").notNull().default(70),
    defaultNotNowDays: integer("default_not_now_days").notNull().default(30),
    defaultOooFollowUpDays: integer("default_ooo_follow_up_days").notNull().default(2),
    bookingLink: text("booking_link"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("product_ai_reply_settings_product_uidx").on(table.productId)],
);

export const productReplyKnowledgeTable = pgTable(
  "product_reply_knowledge",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    /** pricing | product_fact | objection | asset | meeting | other */
    category: text("category").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    url: text("url"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("product_reply_knowledge_product_idx").on(table.productId, table.category)],
);

export const suppressionListTable = pgTable(
  "suppression_list",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    productId: integer("product_id").references(() => productsTable.id, { onDelete: "cascade" }),
    reason: text("reason"),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("suppression_list_email_product_uidx").on(table.email, table.productId)],
);

export const replyAgentAuditTable = pgTable(
  "reply_agent_audit",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id"),
    leadId: integer("lead_id"),
    inboundMessageId: integer("inbound_message_id"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("reply_agent_audit_product_idx").on(table.productId, table.createdAt),
    index("reply_agent_audit_inbound_idx").on(table.inboundMessageId),
  ],
);
