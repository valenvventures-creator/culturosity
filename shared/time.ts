// Timezone helpers without external libraries. Offer windows are stored as
// [starts_at, ends_at) in UTC plus the offer's display timezone.

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function zonedParts(utcMs: number, tz: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function offsetMs(utcMs: number, tz: string): number {
  const p = zonedParts(utcMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (utcMs - (utcMs % 1000));
}

/** Convert a wall-clock date (YYYY-MM-DD) and time (HH:MM) in `tz` to a UTC Date. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = offsetMs(guess, tz);
  let ts = guess - off1;
  const off2 = offsetMs(ts, tz);
  if (off2 !== off1) ts = guess - off2;
  return new Date(ts);
}

/** UTC instant -> { date: YYYY-MM-DD, time: HH:MM } in tz. */
export function utcToZoned(value: string | Date, tz: string): { date: string; time: string } {
  const p = zonedParts(new Date(value).getTime(), tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/**
 * Inclusive date range entered by a person -> end-exclusive UTC window.
 * endDate is the last day the offer is claimable; if endTime is given it is the exact end.
 */
export function windowFromInput(input: {
  ongoing: boolean;
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
  timezone: string;
}): { startsAt: Date | null; endsAt: Date | null } {
  const startsAt = input.startDate ? zonedToUtc(input.startDate, input.startTime || "00:00", input.timezone) : null;
  let endsAt: Date | null = null;
  if (input.endDate) {
    endsAt = input.endTime
      ? zonedToUtc(input.endDate, input.endTime, input.timezone)
      : zonedToUtc(addDays(input.endDate, 1), "00:00", input.timezone);
  }
  return { startsAt, endsAt };
}

/** Human-readable availability, e.g. "Mar 3 – Apr 30, 2027" or "Ongoing". */
export function formatWindow(
  startsAt: string | null,
  endsAt: string | null,
  isOngoing: boolean,
  tz: string,
  locale = "en-CA",
): string {
  const fmt = (d: Date, withYear: boolean) =>
    new Intl.DateTimeFormat(locale, { timeZone: tz, month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) }).format(d);
  if (!endsAt) {
    if (startsAt && new Date(startsAt).getTime() > Date.now()) return `Ongoing from ${fmt(new Date(startsAt), true)}`;
    return "Ongoing";
  }
  // ends_at is exclusive; show the last claimable instant.
  const lastMoment = new Date(new Date(endsAt).getTime() - 1);
  if (!startsAt) return `Until ${fmt(lastMoment, true)}`;
  const s = new Date(startsAt);
  const sameYear = zonedParts(s.getTime(), tz).year === zonedParts(lastMoment.getTime(), tz).year;
  return `${fmt(s, !sameYear)} – ${fmt(lastMoment, true)}`;
}

export function formatDateTime(value: string, tz: string, locale = "en-CA"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

export const COMMON_TIMEZONES = [
  "America/St_Johns",
  "America/Halifax",
  "America/Toronto",
  "America/New_York",
  "America/Winnipeg",
  "America/Chicago",
  "America/Regina",
  "America/Edmonton",
  "America/Denver",
  "America/Phoenix",
  "America/Vancouver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
];
