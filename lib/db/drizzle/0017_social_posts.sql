CREATE TABLE IF NOT EXISTS "social_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE cascade,
  "platform" text NOT NULL,
  "access_token" text,
  "account_id" text,
  "account_name" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  UNIQUE("product_id", "platform")
);

CREATE TABLE IF NOT EXISTS "social_posts" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE cascade,
  "platform" text NOT NULL,
  "scheduled_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'pending_approval',
  "caption" text,
  "hashtags" text,
  "theme" text,
  "image_prompt" text,
  "image_url" text,
  "platform_post_id" text,
  "post_url" text,
  "error_message" text,
  "generated_at" timestamp,
  "approved_at" timestamp,
  "posted_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
