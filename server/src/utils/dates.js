const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses a 'YYYY-MM-DD' string into a UTC-midnight Date, or returns null. */
export function parseDateOnly(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

/** Today's date as 'YYYY-MM-DD' in the app timezone. */
export function todayString() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  }).format(new Date());
}

/** Formats a Date as DD-MM-YYYY. */
export function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = new Date(d).toISOString().slice(0, 10).split('-');
  return `${day}-${m}-${y}`;
}
