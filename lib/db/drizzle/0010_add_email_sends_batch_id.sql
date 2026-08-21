ALTER TABLE "email_sends" ADD COLUMN IF NOT EXISTS "batch_id" text;
CREATE INDEX IF NOT EXISTS "email_sends_batch_id_idx" ON "email_sends" ("batch_id");
