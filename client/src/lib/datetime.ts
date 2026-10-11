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

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))

// BR-33: the Action Date/Time input holds Bangkok wall-clock minutes
// (`2026-10-06T14:05`). Bangkok has no daylight saving, so a fixed +07:00
// shift converts both ways.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000

export const toBangkokInput = (iso: string | number = Date.now()) =>
  new Date(new Date(iso).getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 16)

// BR-32: the server needs an explicit offset.
export const fromBangkokInput = (value: string) => `${value}:00+07:00`
