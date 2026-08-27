-- A/B subject testing + resend-if-unopened for sequence steps

ALTER TABLE "email_sequence_steps" ADD COLUMN IF NOT EXISTS "ab_test_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "email_sequence_steps" ADD COLUMN IF NOT EXISTS "ab_test_split_percent" integer NOT NULL DEFAULT 50;
ALTER TABLE "email_sequence_steps" ADD COLUMN IF NOT EXISTS "subject_variant_b" text;
ALTER TABLE "email_sequence_steps" ADD COLUMN IF NOT EXISTS "body_variant_b" text;
ALTER TABLE "email_sequence_steps" ADD COLUMN IF NOT EXISTS "sections_json_variant_b" jsonb;
ALTER TABLE "email_sequence_steps" ADD COLUMN IF NOT EXISTS "resend_if_unopened" boolean NOT NULL DEFAULT false;
ALTER TABLE "email_sequence_steps" ADD COLUMN IF NOT EXISTS "resend_after_hours" integer NOT NULL DEFAULT 48;

ALTER TABLE "email_sends" ADD COLUMN IF NOT EXISTS "ab_variant" text;
ALTER TABLE "email_sends" ADD COLUMN IF NOT EXISTS "resend_of_send_id" integer;

DO $$ BEGIN
  ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_resend_of_send_id_fkey"
    FOREIGN KEY ("resend_of_send_id") REFERENCES "email_sends"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "email_sends_resend_of_send_id_idx" ON "email_sends" ("resend_of_send_id");
