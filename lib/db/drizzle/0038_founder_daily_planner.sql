-- AI Founder Daily Planner — Phase 1

CREATE TABLE IF NOT EXISTS "agent_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer,
  "source_agent" text NOT NULL,
  "source_entity_type" text,
  "source_entity_id" text,
  "event_type" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "commercial_value" integer DEFAULT 0,
  "probability" integer DEFAULT 50,
  "urgency" integer DEFAULT 50,
  "human_dependency" integer DEFAULT 50,
  "risk_score" integer DEFAULT 0,
  "strategic_score" integer DEFAULT 0,
  "confidence" integer DEFAULT 70,
  "recommended_action" text,
  "action_type" text,
  "execution_type" text DEFAULT 'user_acts' NOT NULL,
  "due_at" timestamp with time zone,
  "status" text DEFAULT 'open' NOT NULL,
  "dedupe_key" text,
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone
);

DO $$ BEGIN
  ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_product_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "agent_events_dedupe_uidx"
  ON "agent_events" ("dedupe_key") WHERE "dedupe_key" IS NOT NULL AND "status" = 'open';
CREATE INDEX IF NOT EXISTS "agent_events_status_idx" ON "agent_events" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "agent_events_product_idx" ON "agent_events" ("product_id", "status");

CREATE TABLE IF NOT EXISTS "planner_preferences" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL,
  "working_mode" text DEFAULT 'balanced',
  "default_available_minutes" integer DEFAULT 240 NOT NULL,
  "maximum_tasks" integer DEFAULT 8 NOT NULL,
  "include_content" boolean DEFAULT false NOT NULL,
  "include_strategy" boolean DEFAULT true NOT NULL,
  "revenue_first" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "planner_preferences_user_uidx" ON "planner_preferences" ("user_id");

CREATE TABLE IF NOT EXISTS "daily_plans" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL,
  "plan_date" date NOT NULL,
  "available_minutes" integer DEFAULT 240 NOT NULL,
  "mode" text DEFAULT 'balanced',
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_replanned_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_plans_user_date_uidx" ON "daily_plans" ("user_id", "plan_date");

CREATE TABLE IF NOT EXISTS "planner_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "daily_plan_id" integer NOT NULL,
  "user_id" varchar NOT NULL,
  "product_id" integer,
  "title" text NOT NULL,
  "description" text,
  "execution_type" text NOT NULL,
  "priority_score" integer DEFAULT 0 NOT NULL,
  "priority_level" text DEFAULT 'medium' NOT NULL,
  "commercial_value" integer DEFAULT 0,
  "estimated_minutes" integer DEFAULT 15,
  "why_it_matters" text,
  "due_at" timestamp with time zone,
  "planned_start" timestamp with time zone,
  "planned_end" timestamp with time zone,
  "status" text DEFAULT 'planned' NOT NULL,
  "source_event_ids" jsonb DEFAULT '[]'::jsonb,
  "action_type" text,
  "deep_link" text,
  "rank" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

DO $$ BEGIN
  ALTER TABLE "planner_items" ADD CONSTRAINT "planner_items_daily_plan_id_fk"
    FOREIGN KEY ("daily_plan_id") REFERENCES "public"."daily_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "planner_items" ADD CONSTRAINT "planner_items_product_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "planner_items_plan_status_idx" ON "planner_items" ("daily_plan_id", "status");
CREATE INDEX IF NOT EXISTS "planner_items_user_idx" ON "planner_items" ("user_id", "status");

CREATE TABLE IF NOT EXISTS "planner_outcomes" (
  "id" serial PRIMARY KEY NOT NULL,
  "planner_item_id" integer NOT NULL,
  "outcome_type" text NOT NULL,
  "notes" text,
  "commercial_result" text,
  "resulting_event_id" integer,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "planner_outcomes" ADD CONSTRAINT "planner_outcomes_planner_item_id_fk"
    FOREIGN KEY ("planner_item_id") REFERENCES "public"."planner_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "planner_audit" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" varchar,
  "daily_plan_id" integer,
  "planner_item_id" integer,
  "event_type" text NOT NULL,
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "planner_audit_user_idx" ON "planner_audit" ("user_id", "created_at");
