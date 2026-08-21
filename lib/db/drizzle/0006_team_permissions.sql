-- Add role to users (existing users become owners)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'owner';

-- Link team_members to user accounts
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "invite_email" text;

-- Vision items become private per user (nullable — existing items stay visible to owner)
ALTER TABLE "vision_items" ADD COLUMN IF NOT EXISTS "user_id" varchar REFERENCES "users"("id") ON DELETE CASCADE;

-- Goals can be assigned to a specific team member
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "assigned_to_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL;

-- Leads can be assigned to a specific team member
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "assigned_to_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL;

-- Activities can be assigned to a specific team member
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "assigned_to_user_id" varchar REFERENCES "users"("id") ON DELETE SET NULL;

-- Product assignments: which products a team member can see
CREATE TABLE IF NOT EXISTS "product_assignments" (
  "id" serial PRIMARY KEY NOT NULL,
  "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE("product_id", "user_id")
);
