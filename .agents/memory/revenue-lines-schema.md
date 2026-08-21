---
name: Revenue lines schema and volume model
description: How revenue lines work — separate table, unit value × volume = revenue, admin role access.
---

# Revenue Lines Schema

## Tables
- `revenue_lines(id, product_id, name, description, unit_value, sort_order, created_at)` — product-level definitions with NO year; span all years.
- `sales_targets.revenue_line_id` FK → revenue_lines; `sales_targets.unit_volume` — stored volume. `target_amount` is computed = `unit_volume × unit_value` on every upsert.
- Unique index `sales_targets_rl_year_month_idx` on `(revenue_line_id, year, month) WHERE revenue_line_id IS NOT NULL`.

## API
- `GET/POST/PATCH/DELETE /revenue-lines` — owner only except GET.
- `POST /sales-targets` — accepts `{ revenueLineId, year, month, unitVolume }` (new style) or legacy `{ productId, year, month, revenueLine, targetAmount }`.
- DELETE a revenue line cascades all monthly entries across all years automatically.

## Roles (three tiers now)
- `owner` — full access everywhere.
- `admin` — can edit monthly volumes (`requireOwnerOrAdmin` middleware); cannot create/delete revenue lines or set unit values.
- `member` — read-only on targets; restricted to assigned leads/goals elsewhere.

**Why:** Owner creates the pricing model (unit value per line); admins enter actual volumes month by month; members see nothing editable.

## Settings UI
- Create-account panel now has a role picker: Member (read-only) vs Admin (can edit figures).
- `accountRole` sent to `POST /team/:id/create-account`.

## Layout badge
- `role === 'member'` → amber "Member" badge.
- `role === 'admin'` → blue "Admin" badge.
