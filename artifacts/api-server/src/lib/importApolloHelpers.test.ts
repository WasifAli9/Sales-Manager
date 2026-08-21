/**
 * Tests for the Apollo CSV import helpers.
 *
 * Covers:
 *   - parseCSV / mapApolloRow with 1,000-row payloads
 *   - runImportApollo: all rows reach the DB (no silent drops)
 *   - runImportApollo: a batchInsert error propagates loudly instead of
 *     producing a partial silent result
 *   - Progress events are emitted for every row
 *
 * Run with: pnpm --filter @workspace/api-server test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseCSV,
  mapApolloRow,
  runImportApollo,
  BATCH_SIZE,
  type MappedRow,
  type ImportDeps,
} from "./importApolloHelpers.ts";

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a valid Apollo-export CSV string with `count` data rows.
 * Rows use only firstName + lastName (no email, no apolloId) so they exercise
 * the batch-insert path — the heaviest path for large imports.
 */
function buildCSV(count: number): string {
  const header = "First Name,Last Name,Company,Title";
  const dataRows = Array.from({ length: count }, (_, i) =>
    `Lead${i},Surname${i},Acme ${i},Rep ${i}`,
  );
  return [header, ...dataRows].join("\n");
}

/**
 * Build a CSV where every row has a unique email but no Apollo ID,
 * so rows exercise the email-dedup upsert path.
 */
function buildEmailCSV(count: number): string {
  const header = "First Name,Last Name,Email";
  const dataRows = Array.from({ length: count }, (_, i) =>
    `Lead${i},Surname${i},lead${i}@example.com`,
  );
  return [header, ...dataRows].join("\n");
}

/**
 * Build a CSV where every row has an Apollo Contact Id,
 * so rows exercise the apolloId upsert path.
 */
function buildApolloIdCSV(count: number): string {
  const header = "First Name,Last Name,Apollo Contact Id";
  const dataRows = Array.from({ length: count }, (_, i) =>
    `Lead${i},Surname${i},apollo_${i}`,
  );
  return [header, ...dataRows].join("\n");
}

/** Minimal no-op deps — every insert counts as a new row. */
function makePassthroughDeps(overrides: Partial<ImportDeps> = {}): ImportDeps {
  return {
    upsertByApolloId: async () => ({ isNew: true }),
    upsertByEmail:    async () => ({ isNew: true }),
    batchInsert:      async (rows) => rows.length,
    onProgress:       () => {},
    ...overrides,
  };
}

// ── Suite 1: parseCSV ────────────────────────────────────────────────────────

describe("parseCSV", () => {
  it("parses exactly 1,000 data rows from a 1,000-row CSV", () => {
    const csv = buildCSV(1_000);
    const rows = parseCSV(csv);
    assert.equal(rows.length, 1_000, `expected 1000 rows, got ${rows.length}`);
  });

  it("parses exactly 1,200 data rows from a 1,200-row CSV", () => {
    const csv = buildCSV(1_200);
    const rows = parseCSV(csv);
    assert.equal(rows.length, 1_200);
  });

  it("every parsed row has the expected header keys", () => {
    const csv = buildCSV(10);
    const rows = parseCSV(csv);
    for (const row of rows) {
      assert.ok("First Name" in row, "row must have 'First Name'");
      assert.ok("Last Name"  in row, "row must have 'Last Name'");
    }
  });

  it("ignores empty trailing lines", () => {
    const csv = buildCSV(5) + "\n\n\n";
    const rows = parseCSV(csv);
    assert.equal(rows.length, 5);
  });

  it("returns empty array for header-only CSV", () => {
    const rows = parseCSV("First Name,Last Name\n");
    assert.equal(rows.length, 0);
  });

  it("handles quoted fields containing commas", () => {
    const csv = `First Name,Last Name,Company\nJane,Doe,"Acme, Inc."`;
    const rows = parseCSV(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]["Company"], "Acme, Inc.");
  });
});

// ── Suite 2: mapApolloRow ────────────────────────────────────────────────────

describe("mapApolloRow", () => {
  it("maps First Name and Last Name correctly", () => {
    const row = mapApolloRow({ "First Name": "Jane", "Last Name": "Doe" });
    assert.equal(row.firstName, "Jane");
    assert.equal(row.lastName,  "Doe");
  });

  it("maps Email to email", () => {
    const row = mapApolloRow({ Email: "jane@example.com" });
    assert.equal(row.email, "jane@example.com");
  });

  it("maps Apollo Contact Id to apolloId", () => {
    const row = mapApolloRow({ "Apollo Contact Id": "abc123" });
    assert.equal(row.apolloId, "abc123");
  });

  it("strips Excel formula-escape prefix from phone numbers", () => {
    const row = mapApolloRow({ "Corporate Phone": "'+442012345678" });
    assert.equal(row.phone, "+442012345678");
  });

  it("returns empty string for firstName when First Name is absent", () => {
    const row = mapApolloRow({});
    assert.equal(row.firstName, "");
  });

  it("round-trips 1,000 rows without losing data", () => {
    const csv  = buildCSV(1_000);
    const rows = parseCSV(csv);
    const mapped = rows.map(mapApolloRow);
    assert.equal(mapped.length, 1_000);
    for (let i = 0; i < 1_000; i++) {
      assert.equal(mapped[i].firstName, `Lead${i}`,    `row ${i} firstName mismatch`);
      assert.equal(mapped[i].lastName,  `Surname${i}`, `row ${i} lastName mismatch`);
      assert.equal(mapped[i].company,   `Acme ${i}`,   `row ${i} company mismatch`);
    }
  });
});

// ── Suite 3: runImportApollo — no silent row drops ───────────────────────────

describe("runImportApollo – 1,000-row batch-insert path", () => {
  it("reports imported === input row count for 1,000 no-id/no-email rows", async () => {
    const csv    = buildCSV(1_000);
    const parsed = parseCSV(csv);
    const mapped = parsed.map(mapApolloRow).filter(r => r.firstName || r.lastName || r.email);

    assert.equal(mapped.length, 1_000, "pre-condition: all 1000 rows survive the filter");

    const result = await runImportApollo(mapped, makePassthroughDeps());

    assert.equal(
      result.imported,
      1_000,
      `imported should equal 1000 but got ${result.imported}`,
    );
    assert.equal(result.updated, 0);
  });

  it("splits 1,000 rows into exactly 10 batches of BATCH_SIZE", async () => {
    const csv    = buildCSV(1_000);
    const mapped = parseCSV(csv).map(mapApolloRow);

    const batchSizes: number[] = [];
    await runImportApollo(mapped, makePassthroughDeps({
      batchInsert: async (rows) => { batchSizes.push(rows.length); return rows.length; },
    }));

    assert.equal(batchSizes.length, 1_000 / BATCH_SIZE, "expected 10 batches");
    assert.ok(
      batchSizes.every(s => s === BATCH_SIZE),
      `every batch should be ${BATCH_SIZE} rows, got: ${batchSizes}`,
    );
  });

  it("handles 1,001 rows: 10 full batches + 1 remainder batch", async () => {
    const csv    = buildCSV(1_001);
    const mapped = parseCSV(csv).map(mapApolloRow);

    const batchSizes: number[] = [];
    const result = await runImportApollo(mapped, makePassthroughDeps({
      batchInsert: async (rows) => { batchSizes.push(rows.length); return rows.length; },
    }));

    assert.equal(batchSizes.length, 11, "expected 11 batches (10 full + 1 remainder)");
    assert.equal(batchSizes[10], 1, "last batch should contain 1 row");
    assert.equal(result.imported, 1_001);
  });

  it("handles a 1,200-row import end-to-end with no silent drops", async () => {
    const csv    = buildCSV(1_200);
    const mapped = parseCSV(csv).map(mapApolloRow);

    const result = await runImportApollo(mapped, makePassthroughDeps());

    assert.equal(result.imported, 1_200);
  });
});

// ── Suite 4: runImportApollo — email-upsert path ─────────────────────────────

describe("runImportApollo – email-upsert path with 1,000 rows", () => {
  it("reports imported === 1,000 when all rows have unique emails (new inserts)", async () => {
    const csv    = buildEmailCSV(1_000);
    const mapped = parseCSV(csv).map(mapApolloRow).filter(r => r.firstName || r.lastName || r.email);

    assert.equal(mapped.length, 1_000);

    const result = await runImportApollo(mapped, makePassthroughDeps({
      upsertByEmail: async () => ({ isNew: true }),
    }));

    assert.equal(result.imported, 1_000);
    assert.equal(result.updated,  0);
  });

  it("reports updated === 1,000 when all emails already exist (all updates)", async () => {
    const csv    = buildEmailCSV(1_000);
    const mapped = parseCSV(csv).map(mapApolloRow).filter(r => r.firstName || r.lastName || r.email);

    const result = await runImportApollo(mapped, makePassthroughDeps({
      upsertByEmail: async () => ({ isNew: false }),
    }));

    assert.equal(result.updated,  1_000);
    assert.equal(result.imported, 0);
  });

  it("splits imported/updated correctly when half are new and half are updates", async () => {
    const csv    = buildEmailCSV(1_000);
    const mapped = parseCSV(csv).map(mapApolloRow).filter(r => r.firstName || r.lastName || r.email);

    let callCount = 0;
    const result = await runImportApollo(mapped, makePassthroughDeps({
      upsertByEmail: async () => {
        const isNew = (callCount++ % 2) === 0;
        return { isNew };
      },
    }));

    assert.equal(result.imported, 500);
    assert.equal(result.updated,  500);
    assert.equal(result.imported + result.updated, 1_000, "imported + updated must equal total");
  });
});

// ── Suite 5: runImportApollo — apolloId-upsert path ─────────────────────────

describe("runImportApollo – apolloId-upsert path with 500 rows", () => {
  it("reports imported === 500 for 500 new Apollo-ID rows", async () => {
    const csv    = buildApolloIdCSV(500);
    const mapped = parseCSV(csv).map(mapApolloRow).filter(r => r.firstName || r.lastName || r.email);

    assert.equal(mapped.length, 500);

    const result = await runImportApollo(mapped, makePassthroughDeps({
      upsertByApolloId: async () => ({ isNew: true }),
    }));

    assert.equal(result.imported, 500);
    assert.equal(result.updated,  0);
  });
});

// ── Suite 6: runImportApollo — mixed paths ───────────────────────────────────

describe("runImportApollo – mixed apolloId / email / no-id rows", () => {
  it("accounts for all rows across all three paths", async () => {
    // 300 rows with apolloId, 400 with email only, 300 with neither
    const apolloRows = parseCSV(buildApolloIdCSV(300)).map(mapApolloRow);
    const emailRows  = parseCSV(buildEmailCSV(400)).map(mapApolloRow);
    const plainRows  = parseCSV(buildCSV(300)).map(mapApolloRow);

    const mixed = [...apolloRows, ...emailRows, ...plainRows];
    assert.equal(mixed.length, 1_000);

    const result = await runImportApollo(mixed, makePassthroughDeps());

    assert.equal(
      result.imported + result.updated,
      1_000,
      "imported + updated must equal total input rows",
    );
  });
});

// ── Suite 7: constraint violation propagates loudly ──────────────────────────

describe("runImportApollo – batch failure propagates loudly", () => {
  it("throws instead of silently dropping rows when batchInsert fails", async () => {
    const csv    = buildCSV(200); // 2 batches
    const mapped = parseCSV(csv).map(mapApolloRow);

    let batchesCalled = 0;
    await assert.rejects(
      async () => {
        await runImportApollo(mapped, makePassthroughDeps({
          batchInsert: async (rows) => {
            batchesCalled++;
            if (batchesCalled === 2) {
              // Simulates a DB constraint violation on the second batch
              throw new Error("duplicate key value violates unique constraint");
            }
            return rows.length;
          },
        }));
      },
      (err: Error) => {
        assert.ok(err instanceof Error, "error must be an Error instance");
        assert.ok(
          err.message.includes("duplicate key"),
          `expected a constraint-violation message, got: "${err.message}"`,
        );
        return true;
      },
      "runImportApollo must rethrow DB errors rather than returning a partial result",
    );

    // First batch succeeded — verify we got there
    assert.equal(batchesCalled, 2, "both batch calls should have been attempted");
  });

  it("throws when upsertByApolloId fails, not silently skipping", async () => {
    const csv    = buildApolloIdCSV(5);
    const mapped = parseCSV(csv).map(mapApolloRow);

    await assert.rejects(
      () => runImportApollo(mapped, makePassthroughDeps({
        upsertByApolloId: async () => { throw new Error("DB connection lost"); },
      })),
      /DB connection lost/,
    );
  });

  it("throws when upsertByEmail fails, not silently skipping", async () => {
    const csv    = buildEmailCSV(5);
    const mapped = parseCSV(csv).map(mapApolloRow);

    await assert.rejects(
      () => runImportApollo(mapped, makePassthroughDeps({
        upsertByEmail: async () => { throw new Error("null value in not-null column"); },
      })),
      /null value in not-null column/,
    );
  });
});

// ── Suite 8: progress events ─────────────────────────────────────────────────

describe("runImportApollo – progress events", () => {
  it("fires a progress event for every row when using the apolloId path", async () => {
    const csv    = buildApolloIdCSV(50);
    const mapped = parseCSV(csv).map(mapApolloRow);

    const events: { processed: number; total: number }[] = [];
    await runImportApollo(mapped, makePassthroughDeps({
      onProgress: (processed, total) => events.push({ processed, total }),
    }));

    // One event per row on the apolloId path
    assert.equal(events.length, 50);
    // Total is always constant
    assert.ok(events.every(e => e.total === 50), "total must stay constant");
    // processed increases monotonically to 50
    assert.equal(events[events.length - 1].processed, 50);
  });

  it("fires a progress event for every batch when using the no-id path", async () => {
    const csv    = buildCSV(300); // 3 batches of 100
    const mapped = parseCSV(csv).map(mapApolloRow);

    const events: number[] = [];
    await runImportApollo(mapped, makePassthroughDeps({
      onProgress: (processed) => events.push(processed),
    }));

    // Expect exactly 3 events (one per batch)
    assert.equal(events.length, 3);
    assert.deepEqual(events, [100, 200, 300]);
  });

  it("final progress event always reports processed === total", async () => {
    const csv    = buildCSV(1_000);
    const mapped = parseCSV(csv).map(mapApolloRow);

    let lastProcessed = -1;
    let lastTotal     = -1;
    await runImportApollo(mapped, makePassthroughDeps({
      onProgress: (p, t) => { lastProcessed = p; lastTotal = t; },
    }));

    assert.equal(lastProcessed, 1_000);
    assert.equal(lastTotal,     1_000);
  });
});
