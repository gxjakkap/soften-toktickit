// Lab 4 api-spec.md §5.3 (BR-34, AC-29): the one server helper for
// Asia/Bangkok day boundaries. Bangkok is a fixed +07:00 with no daylight
// saving, so a constant offset is exact.
const OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

// `YYYY-MM-DD` of the Bangkok calendar day containing `instant`.
export const bangkokDateString = (instant: Date): string =>
  new Date(instant.getTime() + OFFSET_MS).toISOString().slice(0, 10)

// UTC instant of 00:00 +07:00 on the Bangkok day containing `instant`.
export const startOfBangkokDay = (instant: Date): Date =>
  new Date(Date.parse(bangkokDateString(instant)) - OFFSET_MS)

export const addDays = (instant: Date, days: number): Date =>
  new Date(instant.getTime() + days * DAY_MS)

// A date-only filter value means that Bangkok day (BR-34). Returns the
// UTC instant of its 00:00 +07:00, or null for anything that is not a real
// calendar date (`2026-02-30` included).
export function parseBangkokDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return null
  const utcMidnight = Date.parse(value)
  if (Number.isNaN(utcMidnight)) return null
  if (new Date(utcMidnight).toISOString().slice(0, 10) !== value) return null
  return new Date(utcMidnight - OFFSET_MS)
}
