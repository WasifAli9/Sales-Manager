-- Lead Intelligence OS Layer 1 — Phase 1 schema

CREATE TABLE IF NOT EXISTS "companies" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL,
  "name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "domain" text,
  "website" text,
  "industry" text,
  "employee_count" integer,
  "location" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "companies" ADD CONSTRAINT "companies_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "companies_product_domain_uidx"
  ON "companies" ("product_id", "domain") WHERE "domain" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "companies_product_normalized_idx"
  ON "companies" ("product_id", "normalized_name");

CREATE TABLE IF NOT EXISTS "company_intelligence" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "summary" text,
  "industry" text,
  "subsector" text,
  "employee_estimate" integer,
  "locations_estimate" text,
  "operating_model" text,
  "complexity" text,
  "what_they_do" text,
  "customer_type" text,
  "business_model" text,
  "services_offered" text,
  "website_evidence" text,
  "research_status" text DEFAULT 'pending' NOT NULL,
  "research_version" integer DEFAULT 1 NOT NULL,
  "source_data" jsonb,
  "researched_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "company_intelligence" ADD CONSTRAINT "company_intelligence_company_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "company_intelligence" ADD CONSTRAINT "company_intelligence_product_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "company_intelligence_company_product_uidx"
  ON "company_intelligence" ("company_id", "product_id");

CREATE TABLE IF NOT EXISTS "product_icp_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL,
  "target_industries" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "employee_min" integer,
  "employee_max" integer,
  "target_geographies" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "target_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "positive_characteristics" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "negative_characteristics" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "hard_exclusions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "product_icp_profiles" ADD CONSTRAINT "product_icp_profiles_product_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "product_icp_profiles_product_uidx" ON "product_icp_profiles" ("product_id");

CREATE TABLE IF NOT EXISTS "company_icp_analysis" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "industry_score" integer DEFAULT 0 NOT NULL,
  "size_score" integer DEFAULT 0 NOT NULL,
  "geography_score" integer DEFAULT 0 NOT NULL,
  "complexity_score" integer DEFAULT 0 NOT NULL,
  "problem_fit_score" integer DEFAULT 0 NOT NULL,
  "signal_score" integer DEFAULT 0 NOT NULL,
  "total_score" integer DEFAULT 0 NOT NULL,
  "disqualified" boolean DEFAULT false NOT NULL,
  "disqualification_reason" text,
  "reasoning" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "company_icp_analysis" ADD CONSTRAINT "company_icp_analysis_company_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "company_icp_analysis" ADD CONSTRAINT "company_icp_analysis_product_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "company_icp_analysis_company_product_uidx"
  ON "company_icp_analysis" ("company_id", "product_id");

CREATE TABLE IF NOT EXISTS "contact_intelligence" (
  "id" serial PRIMARY KEY NOT NULL,
  "lead_id" integer NOT NULL,
  "persona" text,
  "estimated_decision_role" text,
  "role_relevance" integer DEFAULT 0 NOT NULL,
  "seniority_relevance" integer DEFAULT 0 NOT NULL,
  "contact_score" integer DEFAULT 0 NOT NULL,
  "why_this_person" text,
  "suggested_opening_angle" text,
  "personalisation_facts" jsonb,
  "reasoning" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "contact_intelligence" ADD CONSTRAINT "contact_intelligence_lead_id_fk"
    FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "contact_intelligence_lead_uidx" ON "contact_intelligence" ("lead_id");

CREATE TABLE IF NOT EXISTS "buying_signals" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "signal_type" text NOT NULL,
  "description" text,
  "evidence" text,
  "source" text,
  "source_url" text,
  "confidence" integer DEFAULT 50 NOT NULL,
  "detected_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "buying_signals" ADD CONSTRAINT "buying_signals_company_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "buying_signals_company_idx" ON "buying_signals" ("company_id");

CREATE TABLE IF NOT EXISTS "pain_hypotheses" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "pain_category" text NOT NULL,
  "confidence" integer DEFAULT 50 NOT NULL,
  "evidence" text,
  "priority" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "pain_hypotheses" ADD CONSTRAINT "pain_hypotheses_company_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "pain_hypotheses" ADD CONSTRAINT "pain_hypotheses_product_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "pain_hypotheses_company_product_idx" ON "pain_hypotheses" ("company_id", "product_id");

CREATE TABLE IF NOT EXISTS "lead_scores" (
  "id" serial PRIMARY KEY NOT NULL,
  "lead_id" integer NOT NULL,
  "company_id" integer,
  "icp_score" integer DEFAULT 0 NOT NULL,
  "contact_score" integer DEFAULT 0 NOT NULL,
  "buying_signal_score" integer DEFAULT 0 NOT NULL,
  "priority_score" integer DEFAULT 0 NOT NULL,
  "tier" text DEFAULT 'C' NOT NULL,
  "calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_lead_id_fk"
    FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_company_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "lead_scores_lead_uidx" ON "lead_scores" ("lead_id");

CREATE TABLE IF NOT EXISTS "campaign_recommendations" (
  "id" serial PRIMARY KEY NOT NULL,
  "lead_id" integer NOT NULL,
  "sequence_id" integer,
  "campaign_angle" text,
  "confidence" integer DEFAULT 50 NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "campaign_recommendations" ADD CONSTRAINT "campaign_recommendations_lead_id_fk"
    FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "campaign_recommendations" ADD CONSTRAINT "campaign_recommendations_sequence_id_fk"
    FOREIGN KEY ("sequence_id") REFERENCES "public"."email_sequences"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "campaign_recommendations_lead_idx" ON "campaign_recommendations" ("lead_id");

CREATE TABLE IF NOT EXISTS "research_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL,
  "company_id" integer NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "error_message" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "research_jobs" ADD CONSTRAINT "research_jobs_product_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "research_jobs" ADD CONSTRAINT "research_jobs_company_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "research_jobs_status_idx" ON "research_jobs" ("status");
CREATE INDEX IF NOT EXISTS "research_jobs_product_idx" ON "research_jobs" ("product_id");

CREATE TABLE IF NOT EXISTS "lead_intelligence_audit" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer,
  "lead_id" integer,
  "company_id" integer,
  "event_type" text NOT NULL,
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "lead_intelligence_audit" ADD CONSTRAINT "lead_intelligence_audit_product_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
CREATE INDEX IF NOT EXISTS "lead_intelligence_audit_product_idx" ON "lead_intelligence_audit" ("product_id");

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "company_id" integer;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "research_status" text;

DO $$ BEGIN
  ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "leads_company_id_idx" ON "leads" ("company_id");
CREATE INDEX IF NOT EXISTS "leads_research_status_idx" ON "leads" ("research_status");
