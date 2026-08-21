# Closer

A single-operator sales command center PWA that forces a solo founder to spend 90% of tracked time selling (SELL/CX) across a six-product portfolio, with AI strategy, daily activity generation, and a tough-love coach.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/closer run dev` — run the web frontend (preview path `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`; AI via Replit AI integrations (`AI_INTEGRATIONS_ANTHROPIC_*`, `AI_INTEGRATIONS_OPENAI_*`), provider chosen by `AI_PROVIDER` env (default: anthropic)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5; DB: PostgreSQL + Drizzle ORM; Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from `lib/api-spec/openapi.yaml`)
- Frontend: React + Vite, wouter, TanStack Query, shadcn UI, Tailwind

## Where things live

- API contract: `lib/api-spec/openapi.yaml` (source of truth; run codegen after edits)
- DB schema: `lib/db/src/schema/*` (products, goals, platformStates, resources, activities, reflections, aiAnalyses, visionItems)
- API routes: `artifacts/api-server/src/routes/*`; business logic in `src/lib/` (ai.ts provider abstraction, coach.ts Focus Guard math, strategist.ts prompts)
- Frontend: `artifacts/closer/src/` (pages: Today `/`, Products, Goals, Stack, Vision; theme tokens in `src/index.css`)
- AI clients: `lib/integrations-anthropic-ai`, `lib/integrations-openai-ai-server`

## Architecture decisions

- Built on the workspace stack (React+Vite, Express, Drizzle) instead of the brief's Next.js/Prisma — per earlier agreement with user.
- Coach morning push and Focus Guard are deterministic/rule-based (no LLM) so `/api/summary/today` is instant and free; LLM is used only for strategist, activity generation, tool advisor, and reflection verdicts.
- Strategist competitor analysis is marked `grounded: false` unless the user pastes research — the UI flags ungrounded outputs so invented competitors are never trusted.
- DB rows pass through `toJson()` (Date → ISO string) before response Zod validation — generated schemas expect strings.
- Strategist results are cached in `ai_analyses`, one row per (product, kind); re-running replaces the cached row.

## Product

- Today: coach push, Focus Guard 90/10 meter, ranked activity list, delegate/defer flow for BUILD/ADMIN, AI "generate today's plan", evening reflection with AI verdict.
- Products: portfolio CRUD, platform readiness stages, AI strategist (icp/competitors/value_prop/gtm/cadence).
- Goals: progress bars, 30-day board with required pace, "The Number" total revenue view.
- Stack: tool CRUD with burn rate, AI Tool Advisor suggesting automations.
- Vision: north star, milestones, charity progress.

## User preferences

- Dark theme with CreativeCloud.ai palette (primary #4DD4C1, bg #0B1220); mobile-first with bottom tab bar (Today · Products · Goals · Stack · Vision); no emojis in UI.
- Tough-love coach tone: aimed at behavior, never identity; direct-response copy style, no AI filler.

## Gotchas

- Orval must emit zod v3 syntax: `override.zod.version: 3` in `lib/api-spec/orval.config.ts` (workspace pins zod 3.x for generated client).
- Always run codegen after editing `openapi.yaml`, then typecheck server + frontend.
- Express 5: wildcard routes need names; async handlers annotated `Promise<void>`; early returns use `res.status().json(); return;`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
