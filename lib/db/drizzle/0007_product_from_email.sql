-- Per-product sending identity for Resend
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "from_name" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "from_email" text;

-- Store which from address was actually used for each send
ALTER TABLE "email_sends" ADD COLUMN IF NOT EXISTS "from_address" text;
