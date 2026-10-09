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
