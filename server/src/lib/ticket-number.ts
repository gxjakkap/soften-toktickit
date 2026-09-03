// BR-06: TKT-<4-digit year>-<6-digit zero-padded id>. Derived from the row's
// own autoincrement id after insert (specification.md §7.3) rather than a
// separately tracked counter, so it can never collide under concurrent
// creates.
export function formatTicketNumber(id: number, year: number): string {
  return `TKT-${year}-${String(id).padStart(6, '0')}`
}
