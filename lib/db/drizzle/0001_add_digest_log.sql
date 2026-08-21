CREATE TABLE IF NOT EXISTS "digest_log" (
"id" serial PRIMARY KEY NOT NULL,
"digest_type" varchar(64) NOT NULL,
"digest_date" varchar(10) NOT NULL,
"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
CONSTRAINT "digest_log_type_date_unique" UNIQUE("digest_type","digest_date")
);
