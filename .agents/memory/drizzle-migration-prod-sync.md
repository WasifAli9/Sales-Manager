---
name: Drizzle migration production sync
description: How to reconcile development Drizzle drift without replaying migrations in production.
---

## The problem pattern

The Drizzle migration tracking table lives in the `drizzle` schema (not `public`):
```sql
SELECT * FROM drizzle.__drizzle_migrations;
```
Querying `__drizzle_migrations` (without the schema prefix) silently fails or returns nothing.

When migration SQL content is edited after being applied (or when Replit's publish-time diff and the Drizzle migrator both ran against the same DB), the stored hashes in `drizzle.__drizzle_migrations` diverge from the current SQL files. Drizzle compares by hash, so it considers those migrations already applied and skips them — even if the actual DDL never ran or was rolled back. The server logs "Database migrations applied successfully" because the migrator genuinely found nothing new to do.

## Why publish-time diff alone doesn't fix it

Replit's publish-time schema diff compares the **Replit cloud dev DB** against the **Replit cloud prod DB**. If the dev DB is also missing the schema changes (because `drizzle-kit push` was never run against the cloud DB), both sides look the same → no diff → nothing applied to production.

The dev server's runtime migrator connects to the cloud DB too, but if the migration tracking table already has stale entries for those migrations, it skips them.

## Production rule

Replit manages the production schema through the Publish schema diff. The application must not run Drizzle migrations at production startup: the schema can already contain a newly published column while Drizzle's migration journal does not, causing the app to replay DDL and crash before it becomes ready.

**Why:** Publish-time schema changes and application-owned migration tracking are separate systems. Replaying DDL against the production schema is unsafe and can turn an otherwise successful schema update into a failed publish.

**How to apply:** Keep startup migration execution for development only. In production, let Publish apply the development-to-production diff before the application starts.

## The fix

Run `drizzle-kit push --force` against the dev database to bypass the migration tracker and push the TypeScript schema directly:
```bash
pnpm --filter @workspace/db run push-force
```
This applies the DDL directly, regardless of tracking state. Once the dev DB has the correct schema, re-publish — Replit's diff will detect the gap and apply it to production. Do not use `push-force` or other DDL against production.

**Why:** `push --force` ignores the `drizzle.__drizzle_migrations` table entirely and just diffs the TypeScript schema against the live DB.

## How to apply

Any time you see "Database migrations applied successfully" in the server logs but the expected columns/tables are missing, suspect stale migration tracking. Run `push-force` on dev, verify columns, then re-publish.

## Prevention

New migration SQL files must be added to `lib/db/drizzle/meta/_journal.json` at the same time as the `.sql` file — the migrator ignores SQL files not in the journal. Use `drizzle-kit generate` to create both atomically, then run `push-force` to apply to the dev cloud DB.

## Journal ordering caveat

The runtime migrator also uses the journal entry's `when` timestamp as its migration ordering key. A manually added migration whose timestamp is older than a migration already recorded in `drizzle.__drizzle_migrations` is silently skipped, even when its SQL file is new.

**Why:** The migrator only considers journal entries newer than the latest applied migration timestamp; its success log does not mean every file was eligible to run.

**How to apply:** When hand-authoring a migration, set its `when` value later than every existing journal entry and verify the intended tables or columns in `information_schema` after restart.
