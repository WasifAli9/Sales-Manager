/**
 * Pure helpers for lead list "select next X" (no DB imports).
 */
export const SELECT_NEXT_DEFAULT = 50;
export const SELECT_NEXT_MAX = 500;
export const SELECT_NEXT_PRESETS = [10, 25, 50, 100] as const;

/** Validate limit for select-next. Returns null when invalid. */
export function parseSelectNextLimit(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isInteger(n) || n < 1 || n > SELECT_NEXT_MAX) return null;
  return n;
}

/** Normalize excludeIds to unique positive integers. */
export function parseExcludeIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw
    .map((value) => Number(value))
    .filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(ids)];
}

/** Merge newly selected IDs into an existing selection without duplicates. */
export function mergeSelectedIds(existing: Iterable<number>, next: Iterable<number>): number[] {
  const set = new Set(existing);
  for (const id of next) {
    if (Number.isInteger(id) && id > 0) set.add(id);
  }
  return [...set];
}
