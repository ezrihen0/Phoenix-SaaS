/** Local-calendar day boundaries used by CRM dashboard queries (office + technician snapshots). */

export function startOfLocalDashboardDay(reference: Date = new Date()): Date {
  const date = new Date(reference);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfLocalDashboardDay(reference: Date = new Date()): Date {
  const date = new Date(reference);
  date.setHours(23, 59, 59, 999);
  return date;
}
