-- AI Reply & Follow-Up Agent — Phase 1 schema

ALTER TABLE "email_sends" ADD COLUMN IF NOT EXISTS "rfc_message_id" text;
ALTER TABLE "email_sends" ADD COLUMN IF NOT EXISTS "reply_to_token" text;
CREATE INDEX IF NOT EXISTS "email_sends_rfc_message_id_idx" ON "email_sends" ("rfc_message_id");
CREATE UNIQUE INDEX IF NOT EXISTS "email_sends_reply_to_token_uidx"
  ON "email_sends" ("reply_to_token") WHERE "reply_to_token" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "inbound_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer,
  "lead_id" integer,
  "company_id" integer,
  "sequence_id" integer,
  "outbound_send_id" integer,
  "thread_id" text,
  "external_email_id" text,
  "external_message_id" text,
  "subject" text,
  "body_text" text,
  "body_html" text,
  "sender" text NOT NULL,
  "recipient" text,
  "headers_json" jsonb,
  "match_method" text,
  "processing_status" text DEFAULT 'pending' NOT NULL,
  "inbox_bucket" text DEFAULT 'all' NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_product_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_lead_id_fk"
    FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_outbound_send_id_fk"
    FOREIGN KEY ("outbound_send_id") REFERENCES "public"."email_sends"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "inbound_messages_external_email_uidx"
  ON "inbound_messages" ("external_email_id") WHERE "external_email_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "inbound_messages_product_received_idx" ON "inbound_messages" ("product_id", "received_at");
CREATE INDEX IF NOT EXISTS "inbound_messages_lead_idx" ON "inbound_messages" ("lead_id");
CREATE INDEX IF NOT EXISTS "inbound_messages_bucket_idx" ON "inbound_messages" ("inbox_bucket");

CREATE TABLE IF NOT EXISTS "reply_analyses" (
  "id" serial PRIMARY KEY NOT NULL,
  "inbound_message_id" integer NOT NULL,
  "classification" text NOT NULL,
  "confidence" integer NOT NULL DEFAULT 0,
  "sentiment" text,
  "buying_intent" text,
  "summary" text,
  "objection_type" text,
  "requested_action" text,
  "recommended_action" text,
  "requires_response" boolean DEFAULT true NOT NULL,
  "requires_approval" boolean DEFAULT true NOT NULL,
  "follow_up_days" integer,
  "return_date" text,
  "raw_ai_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "reply_analyses" ADD CONSTRAINT "reply_analyses_inbound_message_id_fk"
    FOREIGN KEY ("inbound_message_id") REFERENCES "public"."inbound_messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "reply_analyses_inbound_uidx" ON "reply_analyses" ("inbound_message_id");

CREATE TABLE IF NOT EXISTS "ai_reply_drafts" (
  "id" serial PRIMARY KEY NOT NULL,
  "inbound_message_id" integer NOT NULL,
  "body" text NOT NULL,
  "subject" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "edited_by_user" varchar,
  "outbound_send_id" integer,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "ai_reply_drafts" ADD CONSTRAINT "ai_reply_drafts_inbound_message_id_fk"
    FOREIGN KEY ("inbound_message_id") REFERENCES "public"."inbound_messages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "ai_reply_drafts_inbound_idx" ON "ai_reply_drafts" ("inbound_message_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_reply_drafts_one_sent_uidx"
  ON "ai_reply_drafts" ("inbound_message_id") WHERE "status" = 'sent';

CREATE TABLE IF NOT EXISTS "follow_ups" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer,
  "lead_id" integer,
  "inbound_message_id" integer,
  "thread_id" text,
  "scheduled_at" timestamp with time zone NOT NULL,
  "reason" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_by" text DEFAULT 'ai' NOT NULL,
  "notified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_product_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_lead_id_fk"
    FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "follow_ups_scheduled_idx" ON "follow_ups" ("status", "scheduled_at");

CREATE TABLE IF NOT EXISTS "product_ai_reply_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL,
  "auto_process_replies" boolean DEFAULT true NOT NULL,
  "auto_pause_on_reply" boolean DEFAULT true NOT NULL,
  "auto_send_high_confidence" boolean DEFAULT false NOT NULL,
  "auto_handle_ooo" boolean DEFAULT true NOT NULL,
  "auto_handle_unsubscribe" boolean DEFAULT true NOT NULL,
  "auto_handle_not_interested" boolean DEFAULT true NOT NULL,
  "auto_answer_product_questions" boolean DEFAULT false NOT NULL,
  "auto_answer_pricing" boolean DEFAULT false NOT NULL,
  "auto_send_meeting_link" boolean DEFAULT false NOT NULL,
  "min_confidence_auto_send" integer DEFAULT 95 NOT NULL,
  "min_confidence_draft" integer DEFAULT 70 NOT NULL,
  "default_not_now_days" integer DEFAULT 30 NOT NULL,
  "default_ooo_follow_up_days" integer DEFAULT 2 NOT NULL,
  "booking_link" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "product_ai_reply_settings" ADD CONSTRAINT "product_ai_reply_settings_product_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "product_ai_reply_settings_product_uidx" ON "product_ai_reply_settings" ("product_id");

CREATE TABLE IF NOT EXISTS "product_reply_knowledge" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL,
  "category" text NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "url" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "product_reply_knowledge" ADD CONSTRAINT "product_reply_knowledge_product_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "product_reply_knowledge_product_idx" ON "product_reply_knowledge" ("product_id", "category");

CREATE TABLE IF NOT EXISTS "suppression_list" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "product_id" integer,
  "reason" text,
  "source" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "suppression_list" ADD CONSTRAINT "suppression_list_product_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "suppression_list_email_product_uidx"
  ON "suppression_list" ("email", "product_id");

CREATE TABLE IF NOT EXISTS "reply_agent_audit" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer,
  "lead_id" integer,
  "inbound_message_id" integer,
  "event_type" text NOT NULL,
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "reply_agent_audit_product_idx" ON "reply_agent_audit" ("product_id", "created_at");
CREATE INDEX IF NOT EXISTS "reply_agent_audit_inbound_idx" ON "reply_agent_audit" ("inbound_message_id");
