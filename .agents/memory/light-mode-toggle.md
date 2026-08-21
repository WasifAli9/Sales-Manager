---
name: Light mode toggle
description: Per-browser dark/light theme toggle — CSS variables, hook, and layout wiring.
---

# Light mode toggle

**Approach:** Dark-first. `:root` defines the dark palette; adding the `light` class to `<html>` overrides every variable to a light slate palette.

**Why:** Minimal surface area — no `next-themes` dependency, no server-side concern. `localStorage` key `closer-theme` persists the preference per browser.

**How to apply:**
- `artifacts/closer/src/index.css` — `.light {}` block overrides all CSS variables; also defines `--sidebar-bg` and `--shell-bg` shell-chrome variables.
- `artifacts/closer/src/hooks/use-theme.ts` — `useTheme()` hook; applies/removes `.light` on `document.documentElement`; returns `{ theme, toggle, isLight }`.
- `artifacts/closer/src/components/layout.tsx` — `SideNav` and `BottomNav` both import `useTheme`; Sun/Moon toggle button added at bottom of sidebar and as an extra icon in the mobile bottom nav. Sidebar and outer shell use `style={{ backgroundColor: 'var(--sidebar-bg)' }}` / `var(--shell-bg)` (not hardcoded hex) so they respond to `.light`.

**Note:** Many modal/card backgrounds hardcode `bg-[#0d1117]` rather than using `bg-card`. These won't auto-switch — a future polish pass can swap them to `bg-card` or `bg-popover`.
