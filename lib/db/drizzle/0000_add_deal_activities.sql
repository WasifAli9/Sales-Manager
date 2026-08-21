-- Add deal_activities table and next_review_date column to pipeline_deals
-- Uses IF NOT EXISTS so it is safe to run on an existing database.

ALTER TABLE "pipeline_deals"
  ADD COLUMN IF NOT EXISTS "next_review_date" date;

CREATE TABLE IF NOT EXISTS "deal_activities" (
  "id" serial PRIMARY KEY NOT NULL,
  "deal_id" integer NOT NULL,
  "kind" text DEFAULT 'note' NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'deal_activities_deal_id_pipeline_deals_id_fk'
  ) THEN
    ALTER TABLE "deal_activities"
      ADD CONSTRAINT "deal_activities_deal_id_pipeline_deals_id_fk"
      FOREIGN KEY ("deal_id") REFERENCES "pipeline_deals"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
