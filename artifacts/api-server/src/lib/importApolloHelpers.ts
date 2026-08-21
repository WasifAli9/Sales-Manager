/**
 * Pure helpers for the POST /api/leads/import-apollo route.
 *
 * Extracted here so they can be unit-tested without a real DB or HTTP server.
 * The route wires in real Drizzle calls; tests inject stubs.
 */

// ── CSV parser (handles quoted fields) ─────────────────────────────────────

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current); current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/^"(.*)"$/, "$1"));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? "").trim().replace(/^"(.*)"$/, "$1"); });
    rows.push(row);
  }
  return rows;
}

export function mapApolloRow(row: Record<string, string>) {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = row[k];
      if (v && v.trim()) {
        // Strip Excel's formula-escape prefix (e.g. '+44... → +44...)
        return v.trim().replace(/^'+/, "");
      }
    }
    return undefined;
  };
  return {
    firstName: get("First Name", "first_name", "FirstName") ?? "",
    lastName: get("Last Name", "last_name", "LastName") ?? "",
    email: get("Email", "email", "Email Address"),
    company: get("Company", "Company Name", "company", "Account Name"),
    title: get("Title", "Job Title", "title", "Position"),
    phone: get("Corporate Phone", "Phone", "Mobile Phone", "phone", "Direct Phone"),
    linkedinUrl: get("Person Linkedin Url", "LinkedIn Url", "linkedin_url", "LinkedIn"),
    companyLinkedinUrl: get("Company Linkedin Url", "company_linkedin_url", "Company LinkedIn"),
    instagramUrl: get("Instagram", "Instagram URL", "instagram_url", "Instagram Url"),
    facebookUrl: get("Facebook", "Facebook URL", "facebook_url", "Facebook Url"),
    tiktokUrl: get("TikTok", "TikTok URL", "tiktok_url", "TikTok Url"),
    address: get("Address", "address", "Location", "City", "Company Address"),
    apolloId: get("Apollo Contact Id", "Contact Id", "ID", "id"),
  };
}

export type MappedRow = ReturnType<typeof mapApolloRow>;

// ── Batch size ──────────────────────────────────────────────────────────────

export const BATCH_SIZE = 100;

// ── Dependency-injected import runner ───────────────────────────────────────

export interface ImportDeps {
  /**
   * Look up an existing lead by apolloId, then upsert.
   * Returns `{ isNew: true }` when a new row was inserted, `{ isNew: false }` on update.
   */
  upsertByApolloId: (data: MappedRow) => Promise<{ isNew: boolean }>;

  /**
   * Look up an existing lead by email (when no apolloId), then upsert.
   * Returns `{ isNew: true }` for insert, `{ isNew: false }` for update.
   */
  upsertByEmail: (data: MappedRow) => Promise<{ isNew: boolean }>;

  /**
   * Bulk-insert a batch of rows that have no apolloId and no email.
   * Must throw on any DB error so the caller can surface it as a loud failure.
   * Returns the number of rows actually inserted.
   */
  batchInsert: (rows: MappedRow[]) => Promise<number>;

  /** Called after every row (or batch) is processed. */
  onProgress: (processed: number, total: number) => void;
}

export interface ImportResult {
  imported: number;
  updated: number;
}

/**
 * Core import algorithm extracted for testability.
 *
 * Processing strategy:
 *   1. Rows with an Apollo ID  → upsert one-by-one (few rows, needs dedup)
 *   2. Rows with email only    → upsert one-by-one (email dedup)
 *   3. Remaining rows          → batch insert in chunks of BATCH_SIZE
 *
 * Any error from the deps is allowed to propagate — the caller (route handler)
 * wraps this in a try/catch and emits a loud SSE error event.  Silent partial
 * results are never returned.
 */
export async function runImportApollo(
  mapped: MappedRow[],
  deps: ImportDeps,
): Promise<ImportResult> {
  const withApolloId         = mapped.filter(r => r.apolloId);
  const withoutApolloIdEmail = mapped.filter(r => !r.apolloId && r.email);
  const noIdNoEmail          = mapped.filter(r => !r.apolloId && !r.email);

  const total = mapped.length;
  let processed = 0;
  let imported  = 0;
  let updated   = 0;

  // ── 1. Upsert by Apollo ID ───────────────────────────────────────────────
  for (const data of withApolloId) {
    const { isNew } = await deps.upsertByApolloId(data);
    if (isNew) imported++; else updated++;
    processed++;
    deps.onProgress(processed, total);
  }

  // ── 2. Upsert by email ───────────────────────────────────────────────────
  for (const data of withoutApolloIdEmail) {
    const { isNew } = await deps.upsertByEmail(data);
    if (isNew) imported++; else updated++;
    processed++;
    if (processed % 10 === 0 || processed === total) {
      deps.onProgress(processed, total);
    }
  }

  // ── 3. Batch insert (no apolloId, no email) ──────────────────────────────
  for (let i = 0; i < noIdNoEmail.length; i += BATCH_SIZE) {
    const batch = noIdNoEmail.slice(i, i + BATCH_SIZE);
    // batchInsert MUST throw on DB errors — never swallow them silently
    const count = await deps.batchInsert(batch);
    imported  += count;
    processed += batch.length;
    deps.onProgress(processed, total);
  }

  return { imported, updated };
}
