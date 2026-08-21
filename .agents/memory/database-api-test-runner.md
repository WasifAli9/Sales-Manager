---
name: Database-backed API test runner
description: How API tests that import workspace database source run reliably in this monorepo.
---

Node's `--experimental-strip-types` test runner cannot resolve this monorepo's workspace source exports, including directory-style schema imports. Database-backed API tests should use the API artifact's existing esbuild dependency to bundle the test as CommonJS before Node executes it, and should clean up the temporary bundle afterwards.

**Why:** Direct execution fails before test setup with ESM directory-import errors, while an ESM bundle can also break PostgreSQL's dynamic CommonJS requires.

**How to apply:** Use the existing API test build helper for tests that need `@workspace/db` source access. Keep ordinary pure unit tests on the lightweight Node runner, and keep the bundled database test's data cleanup scoped to unique test fixtures.