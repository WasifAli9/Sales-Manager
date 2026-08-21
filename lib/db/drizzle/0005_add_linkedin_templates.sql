CREATE TABLE IF NOT EXISTS "linkedin_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "type" text DEFAULT 'message' NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
