/**
 * Validates a raw `scheduledFor` string from request bodies.
 *
 * Returns:
 *  - `{ ok: true, date }` when the value is a valid future timestamp
 *  - `{ ok: false, status, error }` when it should be rejected
 */
export function validateScheduledFor(
  raw: string | undefined | null,
): { ok: true; date: Date } | { ok: false; status: 400 | 422; error: string } {
  if (!raw) {
    return { ok: false, status: 400, error: "scheduledFor is required" };
  }

  const date = new Date(raw);
  if (isNaN(date.getTime())) {
    return { ok: false, status: 400, error: "invalid scheduledFor date" };
  }

  if (date.getTime() <= Date.now()) {
    return { ok: false, status: 422, error: "scheduledFor must be a future timestamp" };
  }

  return { ok: true, date };
}
