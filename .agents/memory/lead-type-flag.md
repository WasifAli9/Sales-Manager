---
name: Lead type flag
description: end_user vs reseller distinction on leads — schema, migration, API, and UI.
---

# Lead type flag

Added `lead_type text NOT NULL DEFAULT 'end_user'` to the leads table.

**Why:** Teams sell to both direct buyers and channel/distribution partners; reps need to separate the two cohorts.

**How to apply:**
- Migration: `lib/db/drizzle/0020_lead_type.sql` (already applied).
- Schema field: `leadType` in `lib/db/src/schema/leads.ts`.
- GET `/api/leads` accepts `?leadType=end_user|reseller` filter.
- POST `/api/leads` and PATCH `/api/leads/:id` accept `leadType`.
- POST `/api/leads/import-apollo` accepts `leadType`; applied uniformly to all rows in a single import batch.
- Frontend: picker in `AddLeadDialog` and `ApolloImportDialog`; filter pill row (violet colour) on leads page; "Reseller" badge on `LeadCard` (only shown for resellers — end users show no extra badge).
