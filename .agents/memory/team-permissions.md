---
name: Team permissions system
description: How multi-role (owner/member) access control works in Closer
---

## Rule
All data is scoped by role (`users.role = 'owner' | 'member'`). Role is stored in the session and included in `req.user.role` via `AuthUser`.

**Why:** The app started single-tenant; team members needed scoped read-only access to specific data.

## How to apply

### Schema
- `users.role` varchar, default 'owner' — existing users automatically became owners
- `team_members.userId` — FK to users; set when owner creates a login for a team member
- `vision_items.userId` — private per user; null = legacy owner items
- `goals.assignedToUserId` — members see only their assigned goals
- `leads.assignedToUserId` — members see only their assigned leads
- `activities.assignedToUserId` — members see only their assigned activities
- `product_assignments(productId, userId)` — junction table; members see only assigned products

### Auth
- `userToPublic()` in `auth.ts` includes `role`
- `GetCurrentAuthUserResponse` Zod schema in `api-zod/src/generated/api.ts` includes `role`
- `AuthUser` interface in `api-zod/src/generated/types/authUser.ts` includes `role`
- `webauthn.ts` sessionData also includes `role` from dbUser

### Middleware
- `requireOwner` middleware in `middlewares/requireOwner.ts` — blocks non-owners with 403

### Key endpoints
- `POST /api/team/:id/create-account` — owner creates user account (role='member') for a team member, links `team_members.userId`
- `DELETE /api/team/:id/remove-account` — owner removes member's login
- `POST/DELETE /api/product-assignments` — owner assigns/unassigns products to members

### Member restrictions
- Goals: can only update `currentValue` on their assigned goals; cannot create/delete
- Leads: can only log actions on assigned leads; cannot create/delete/edit fields
- Products: read-only, only assigned products visible
- Activities: read-only filtered to assigned activities
- Vision: full read/write on their OWN items only (private, not shared)

### Build note
`lib/db` and `lib/api-zod` use TypeScript project references (`composite: true`) with `dist/` `.d.ts` outputs. After schema changes, must run `pnpm exec tsc --build` in each package before API server type-checks pass.
