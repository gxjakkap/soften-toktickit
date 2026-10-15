// Lab 4 ui-spec.md §2.1 (specification.md BR-33): every date/time renders in
// Asia/Bangkok, whatever the browser's own time zone, as "6 Oct 2026, 14:05".
const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

// ICU's en-GB data abbreviates September as "Sept"; ui-spec.md §2.1 uses
// three-letter months throughout, so every date output goes through this.
const threeLetterMonth = (text: string) => text.replace('Sept', 'Sep')

export const formatDateTime = (iso: string) => threeLetterMonth(dateTime.format(new Date(iso)))

const dateOnly = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

// A `YYYY-MM-DD` filter value is a Bangkok calendar day (BR-34): "6 Oct 2026".
// An unparseable value (a hand-edited URL) comes back as typed, since
// Intl.DateTimeFormat throws on an invalid Date.
// A stored instant as its Bangkok calendar day: "6 Oct 2026".
export const formatDate = (iso: string) => threeLetterMonth(dateOnly.format(new Date(iso)))

export const formatBangkokDate = (date: string) => {
  const parsed = new Date(`${date}T00:00:00+07:00`)
  return Number.isNaN(parsed.getTime()) ? date : threeLetterMonth(dateOnly.format(parsed))
}

const timeOnly = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

// ui-spec.md §3: the dashboard "Updated 14:05" line.
export const formatTime = (iso: string) => timeOnly.format(new Date(iso))

// BR-33: the Action Date/Time input holds Bangkok wall-clock minutes
// (`2026-10-06T14:05`). Bangkok has no daylight saving, so a fixed +07:00
// shift converts both ways.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

export const toBangkokInput = (iso: string | number = Date.now()) =>
  new Date(new Date(iso).getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 16)

// BR-32: the server needs an explicit offset.
export const fromBangkokInput = (value: string) => `${value}:00+07:00`
