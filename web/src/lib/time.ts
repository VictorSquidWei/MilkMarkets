import { PACIFIC_TZ } from '../config/constants';

/** Pacific-time calendar day as 'YYYY-MM-DD' (observes DST per OQ-9). */
export function dayPST(ts: number = Date.now()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: PACIFIC_TZ }).format(new Date(ts));
}

/** Human Pacific date, e.g. "Jun 1, 2026". */
export function formatPSTDate(ts: number): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC_TZ, dateStyle: 'medium' }).format(
    new Date(ts),
  );
}

/** Human Pacific date + time, e.g. "Jun 1, 2026, 2:30 PM". */
export function formatPSTDateTime(ts: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ts));
}
