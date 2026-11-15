// Pure date/time helpers for sequence scheduling. No server-only imports, so
// the same code runs in the API (to create the real schedule) and in the
// browser (to preview that schedule while the user edits the steps).

export const MAX_SEQUENCE_STEPS = 5;
export const MIN_SEQUENCE_STEPS = 2;

export const TIMEZONES: { value: string; label: string }[] = [
  { value: 'Asia/Kolkata',        label: 'India (IST, UTC+5:30)' },
  { value: 'UTC',                 label: 'UTC' },
  { value: 'Asia/Dubai',          label: 'Dubai (GST, UTC+4)' },
  { value: 'Asia/Singapore',      label: 'Singapore (SGT, UTC+8)' },
  { value: 'Europe/London',       label: 'London (GMT/BST)' },
  { value: 'Europe/Berlin',       label: 'Central Europe (CET/CEST)' },
  { value: 'America/New_York',    label: 'US Eastern (ET)' },
  { value: 'America/Chicago',     label: 'US Central (CT)' },
  { value: 'America/Los_Angeles', label: 'US Pacific (PT)' },
  { value: 'Australia/Sydney',    label: 'Sydney (AEST/AEDT)' },
];

export type DelayUnit = 'hours' | 'days';

export interface StepTiming {
  delay_amount: number;
  delay_unit: DelayUnit;
  /** 'HH:MM' in the sequence timezone; only used when delay_unit = 'days' */
  send_time?: string | null;
}

interface Wall { y: number; m: number; d: number; hh: number; mm: number; ss: number }

export function isValidTimezone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Wall-clock fields of an instant, as seen in `tz`. */
export function wallParts(date: Date, tz: string): Wall {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = parseInt(p.value, 10);
  }
  return { y: out.year, m: out.month, d: out.day, hh: out.hour % 24, mm: out.minute, ss: out.second };
}

/** Offset of `tz` from UTC at the given instant, in ms (e.g. IST = +19_800_000). */
function tzOffsetMs(utcMs: number, tz: string): number {
  const w = wallParts(new Date(utcMs), tz);
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The instant at which the wall clock in `tz` reads y-m-d hh:mm (DST-safe). */
export function wallToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let result = guess - tzOffsetMs(guess, tz);
  // Re-check the offset at the candidate instant — fixes the hour around DST changes.
  const adj = guess - tzOffsetMs(result, tz);
  if (adj !== result) result = adj;
  return new Date(result);
}

/** 'YYYY-MM-DDTHH:mm' (datetime-local value) read as wall-clock time in `tz`. */
export function wallInputToUtc(value: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value ?? '');
  if (!m) return null;
  return wallToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], tz);
}

/** Inverse of wallInputToUtc — value for a <input type="datetime-local">. */
export function utcToWallInput(date: Date | string, tz: string): string {
  const w = wallParts(new Date(date), tz);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${w.y}-${p(w.m)}-${p(w.d)}T${p(w.hh)}:${p(w.mm)}`;
}

export function parseSendTime(s?: string | null): { hh: number; mm: number } | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((s ?? '').trim());
  return m ? { hh: +m[1], mm: +m[2] } : null;
}

/** Human-readable date/time in `tz`, e.g. "Mon, 16 Nov 2026, 10:00 am". */
export function formatInTz(date: Date | string | null | undefined, tz: string): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(date));
}

/**
 * Send time of every step. Step 1 goes at `start`. Each later step waits
 * `delay_amount` hours (exact offset) or days (calendar days in `tz`, landing
 * on `send_time` — or the previous step's clock time if none is set) after
 * the PREVIOUS step. Always strictly later than the previous step.
 */
export function computeSchedule(start: Date, steps: StepTiming[], tz: string): Date[] {
  const out: Date[] = [];
  steps.forEach((s, i) => {
    if (i === 0) { out.push(new Date(start)); return; }
    const prev = out[i - 1];
    const amount = Math.max(1, Math.floor(Number(s.delay_amount) || 1));
    let next: Date;
    if (s.delay_unit === 'hours') {
      next = new Date(prev.getTime() + amount * 3_600_000);
    } else {
      const w = wallParts(prev, tz);
      const t = parseSendTime(s.send_time) ?? { hh: w.hh, mm: w.mm };
      const day = new Date(Date.UTC(w.y, w.m - 1, w.d + amount)); // normalises month/year rollover
      next = wallToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), t.hh, t.mm, tz);
    }
    out.push(next);
  });
  return out;
}
