-- Per-team-member daily outbound email limits (org-wide settings)

CREATE TABLE IF NOT EXISTS "org_email_send_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "daily_max" integer DEFAULT 100 NOT NULL,
  "daily_min" integer,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "org_email_send_settings" ("id", "enabled", "daily_max")
SELECT 1, false, 100
WHERE NOT EXISTS (SELECT 1 FROM "org_email_send_settings" WHERE "id" = 1);

CREATE TABLE IF NOT EXISTS "user_email_daily_quotas" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" varchar NOT NULL,
  "quota_date" date NOT NULL,
  "allowed_count" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_email_daily_quotas_user_date_uidx"
  ON "user_email_daily_quotas" ("user_id", "quota_date");

ALTER TABLE "email_sends" ADD COLUMN IF NOT EXISTS "scheduled_by_user_id" varchar;

CREATE INDEX IF NOT EXISTS "email_sends_scheduled_by_user_idx"
  ON "email_sends" ("scheduled_by_user_id", "status", "sent_at");
