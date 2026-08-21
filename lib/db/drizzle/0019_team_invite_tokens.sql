CREATE TABLE IF NOT EXISTS "team_invite_tokens" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_member_id" integer NOT NULL REFERENCES "team_members"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "account_role" varchar NOT NULL DEFAULT 'member',
  "token_hash" varchar NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
