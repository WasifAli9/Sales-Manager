---
name: Orval zod version pin
description: Orval 8.x emits zod v4 syntax by default; this workspace's generated packages use zod 3.x
---

Rule: keep `override: { zod: { version: 3 } }` in `lib/api-spec/orval.config.ts`.

**Why:** Orval 8.23+ defaults to zod v4 output (`zod.int()`, etc.) which fails to compile against the zod 3.25 pinned for generated packages. Codegen then breaks with confusing type errors in generated files.

**How to apply:** If codegen output suddenly fails typecheck with unknown zod methods after an orval upgrade or config rewrite, check this override first.
