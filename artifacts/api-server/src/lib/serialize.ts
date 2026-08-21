/**
 * Convert DB rows to JSON-safe values (Date -> ISO string) so they can be
 * validated by the generated OpenAPI Zod schemas, which expect strings.
 */
export function toJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}
