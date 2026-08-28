-- AI Opportunity & Deal Agent — Phase 1

-- Remap legacy stages
UPDATE "pipeline_deals" SET "stage" = 'interested' WHERE "stage" = 'prospect';
UPDATE "pipeline_deals" SET "stage" = 'won' WHERE "stage" = 'closed_won';
UPDATE "pipeline_deals" SET "stage" = 'lost' WHERE "stage" = 'closed_lost';

ALTER TABLE "pipeline_deals" ADD COLUMN IF NOT EXISTS "lead_id" integer;
ALTER TABLE "pipeline_deals" ADD COLUMN IF NOT EXISTS "company_id" integer;
ALTER TABLE "pipeline_deals" ADD COLUMN IF NOT EXISTS "owner_user_id" varchar;
ALTER TABLE "pipeline_deals" ADD COLUMN IF NOT EXISTS "health" text DEFAULT 'healthy';
ALTER TABLE "pipeline_deals" ADD COLUMN IF NOT EXISTS "source" text;
ALTER TABLE "pipeline_deals" ADD COLUMN IF NOT EXISTS "source_inbound_id" integer;
ALTER TABLE "pipeline_deals" ADD COLUMN IF NOT EXISTS "sequence_id" integer;
ALTER TABLE "pipeline_deals" ADD COLUMN IF NOT EXISTS "mrr" numeric(14, 2);
ALTER TABLE "pipeline_deals" ADD COLUMN IF NOT EXISTS "arr" numeric(14, 2);
ALTER TABLE "pipeline_deals" ADD COLUMN IF NOT EXISTS "lost_reason" text;
ALTER TABLE "pipeline_deals" ADD COLUMN IF NOT EXISTS "won_at" timestamp with time zone;
ALTER TABLE "pipeline_deals" ADD COLUMN IF NOT EXISTS "lost_at" timestamp with time zone;
ALTER TABLE "pipeline_deals" ADD COLUMN IF NOT EXISTS "attention_score" integer DEFAULT 0;
ALTER TABLE "pipeline_deals" ADD COLUMN IF NOT EXISTS "last_engagement_at" timestamp with time zone;

DO $$ BEGIN
  ALTER TABLE "pipeline_deals" ADD CONSTRAINT "pipeline_deals_lead_id_fk"
    FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "pipeline_deals_lead_idx" ON "pipeline_deals" ("lead_id");
CREATE INDEX IF NOT EXISTS "pipeline_deals_company_idx" ON "pipeline_deals" ("company_id");
CREATE INDEX IF NOT EXISTS "pipeline_deals_health_idx" ON "pipeline_deals" ("health");
CREATE INDEX IF NOT EXISTS "pipeline_deals_stage_idx" ON "pipeline_deals" ("stage");

CREATE TABLE IF NOT EXISTS "opportunity_intelligence" (
  "id" serial PRIMARY KEY NOT NULL,
  "deal_id" integer NOT NULL,
  "summary" text,
  "primary_pain" text,
  "pain_severity" text DEFAULT 'hypothesis',
  "qualification_score" integer DEFAULT 0,
  "deal_strategy" text,
  "recommended_next_action" text,
  "next_action_reason" text,
  "next_action_due" timestamp with time zone,
  "attention_priority" integer DEFAULT 0,
  "stage_recommendation" text,
  "stage_recommendation_confidence" integer,
  "stage_recommendation_evidence" text,
  "raw_ai_json" jsonb,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "opportunity_intelligence" ADD CONSTRAINT "opportunity_intelligence_deal_id_fk"
    FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "opportunity_intelligence_deal_uidx" ON "opportunity_intelligence" ("deal_id");

CREATE TABLE IF NOT EXISTS "opportunity_contacts" (
  "id" serial PRIMARY KEY NOT NULL,
  "deal_id" integer NOT NULL,
  "lead_id" integer,
  "name" text,
  "stakeholder_role" text,
  "influence" text,
  "sentiment" text,
  "decision_role_confidence" integer,
  "primary_contact" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "opportunity_contacts" ADD CONSTRAINT "opportunity_contacts_deal_id_fk"
    FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "opportunity_risks" (
  "id" serial PRIMARY KEY NOT NULL,
  "deal_id" integer NOT NULL,
  "risk_type" text NOT NULL,
  "description" text,
  "severity" text DEFAULT 'medium',
  "evidence" text,
  "status" text DEFAULT 'open' NOT NULL,
  "recommended_mitigation" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone
);

DO $$ BEGIN
  ALTER TABLE "opportunity_risks" ADD CONSTRAINT "opportunity_risks_deal_id_fk"
    FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "opportunity_risks_deal_idx" ON "opportunity_risks" ("deal_id", "status");

CREATE TABLE IF NOT EXISTS "opportunity_objections" (
  "id" serial PRIMARY KEY NOT NULL,
  "deal_id" integer NOT NULL,
  "objection_type" text,
  "description" text,
  "evidence" text,
  "status" text DEFAULT 'open' NOT NULL,
  "raised_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone
);

DO $$ BEGIN
  ALTER TABLE "opportunity_objections" ADD CONSTRAINT "opportunity_objections_deal_id_fk"
    FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "opportunity_qualification" (
  "id" serial PRIMARY KEY NOT NULL,
  "deal_id" integer NOT NULL,
  "problem_status" text DEFAULT 'unknown',
  "fit_status" text DEFAULT 'unknown',
  "authority_status" text DEFAULT 'unknown',
  "commercials_status" text DEFAULT 'unknown',
  "timing_status" text DEFAULT 'unknown',
  "next_step_status" text DEFAULT 'unknown',
  "completeness_score" integer DEFAULT 0,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "opportunity_qualification" ADD CONSTRAINT "opportunity_qualification_deal_id_fk"
    FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "opportunity_qualification_deal_uidx" ON "opportunity_qualification" ("deal_id");

CREATE TABLE IF NOT EXISTS "opportunity_stage_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "deal_id" integer NOT NULL,
  "from_stage" text,
  "to_stage" text NOT NULL,
  "change_source" text DEFAULT 'user',
  "ai_confidence" integer,
  "reason" text,
  "changed_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "opportunity_stage_history" ADD CONSTRAINT "opportunity_stage_history_deal_id_fk"
    FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "opportunity_actions" (
  "id" serial PRIMARY KEY NOT NULL,
  "deal_id" integer NOT NULL,
  "product_id" integer,
  "action_type" text NOT NULL,
  "description" text NOT NULL,
  "due_at" timestamp with time zone,
  "priority" integer DEFAULT 50,
  "status" text DEFAULT 'pending' NOT NULL,
  "generated_by" text DEFAULT 'ai',
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "opportunity_actions" ADD CONSTRAINT "opportunity_actions_deal_id_fk"
    FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "opportunity_actions_status_due_idx" ON "opportunity_actions" ("status", "due_at");
CREATE INDEX IF NOT EXISTS "opportunity_actions_product_idx" ON "opportunity_actions" ("product_id");

CREATE TABLE IF NOT EXISTS "opportunity_competitors" (
  "id" serial PRIMARY KEY NOT NULL,
  "deal_id" integer NOT NULL,
  "name" text NOT NULL,
  "type" text,
  "notes" text,
  "evidence" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "opportunity_competitors" ADD CONSTRAINT "opportunity_competitors_deal_id_fk"
    FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "lost_deal_details" (
  "id" serial PRIMARY KEY NOT NULL,
  "deal_id" integer NOT NULL,
  "reason" text NOT NULL,
  "competitor" text,
  "notes" text,
  "ai_suggested_reason" text,
  "user_confirmed" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "lost_deal_details" ADD CONSTRAINT "lost_deal_details_deal_id_fk"
    FOREIGN KEY ("deal_id") REFERENCES "public"."pipeline_deals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "lost_deal_details_deal_uidx" ON "lost_deal_details" ("deal_id");

CREATE TABLE IF NOT EXISTS "product_opportunity_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL,
  "auto_create_enabled" boolean DEFAULT true NOT NULL,
  "trigger_book_meeting" boolean DEFAULT true NOT NULL,
  "trigger_interested" boolean DEFAULT true NOT NULL,
  "trigger_pricing" boolean DEFAULT false NOT NULL,
  "require_non_reject_tier" boolean DEFAULT true NOT NULL,
  "auto_stage_move" boolean DEFAULT false NOT NULL,
  "min_stage_confidence" integer DEFAULT 90 NOT NULL,
  "stall_days" integer DEFAULT 14 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "product_opportunity_settings" ADD CONSTRAINT "product_opportunity_settings_product_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "product_opportunity_settings_product_uidx" ON "product_opportunity_settings" ("product_id");

CREATE TABLE IF NOT EXISTS "opportunity_agent_audit" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer,
  "deal_id" integer,
  "lead_id" integer,
  "event_type" text NOT NULL,
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "opportunity_agent_audit_deal_idx" ON "opportunity_agent_audit" ("deal_id", "created_at");
CREATE INDEX IF NOT EXISTS "opportunity_agent_audit_product_idx" ON "opportunity_agent_audit" ("product_id", "created_at");
