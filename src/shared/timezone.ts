export const BUCHAREST_TIMEZONE = "Europe/Bucharest";

export interface BucharestDateTimeParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  dayOfWeek: number; // 0 = Sun .. 6 = Sat
  year: number;
  month1Based: number; // 1..12
  month0Based: number; // 0..11
  day: number; // 1..31
  hours: number; // 0..23
  minutes: number; // 0..59
}

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUCHAREST_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function extractPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string {
  const found = parts.find((p) => p.type === type);
  return found ? found.value : "";
}

export function getBucharestNowParts(
  now: Date = new Date()
): BucharestDateTimeParts {
  const parts = partsFormatter.formatToParts(now);
  const yearStr = extractPart(parts, "year");
  const monthStr = extractPart(parts, "month");
  const dayStr = extractPart(parts, "day");
  const hourRaw = extractPart(parts, "hour");
  const minuteStr = extractPart(parts, "minute");

  const hours = Number(hourRaw) % 24;
  const minutes = Number(minuteStr);
  const year = Number(yearStr);
  const month1Based = Number(monthStr);
  const day = Number(dayStr);

  const date = `${yearStr}-${monthStr}-${dayStr}`;
  const time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const dayOfWeek = getBucharestDayOfWeek(date);

  return {
    date,
    time,
    dayOfWeek,
    year,
    month1Based,
    month0Based: month1Based - 1,
    day,
    hours,
    minutes,
  };
}

export function getBucharestDate(now: Date = new Date()): string {
  return getBucharestNowParts(now).date;
}

export function getBucharestTime(now: Date = new Date()): string {
  return getBucharestNowParts(now).time;
}

/**
 * Returns 0 (Sunday) through 6 (Saturday) for a YYYY-MM-DD calendar date
 * (or the current Europe/Bucharest date if omitted).
 */
export function getBucharestDayOfWeek(dateStr?: string): number {
  const target = dateStr ?? getBucharestDate();
  const [y, m, d] = target.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Returns the previous calendar date (YYYY-MM-DD) using UTC calendar math (DST-safe).
 */
export function getPreviousCalendarDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  return formatUtcDate(dt);
}

/**
 * Returns the next calendar date (YYYY-MM-DD) using UTC calendar math (DST-safe).
 */
export function getNextCalendarDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return formatUtcDate(dt);
}

function formatUtcDate(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatMonthKey(year: number, month1Based: number): string {
  return `${year}-${String(month1Based).padStart(2, "0")}`;
}

export function rosterMonthToKey(year: number, month0Based: number): string {
  return formatMonthKey(year, month0Based + 1);
}

export function parseMonthKey(
  monthKey: string
): { year: number; month1Based: number; month0Based: number } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month1Based = Number(match[2]);
  return {
    year,
    month1Based,
    month0Based: month1Based - 1,
  };
}

/**
 * Formats a YYYY-MM-DD date string as DD-MM-YYYY for display.
 */
export function formatDisplayDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/**
 * Converts 12-hour AM/PM times inside a string (e.g. "09:00AM - 12:00PM")
 * to 24-hour HH:MM format ("09:00 - 12:00").
 */
export function formatTimeInterval24h(raw: string): string {
  if (!raw) return raw;
  return raw.replace(
    /\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/gi,
    (_match, hStr: string, mStr: string, ampm: string) => {
      let hours = Number.parseInt(hStr, 10);
      const upper = ampm.toUpperCase();
      if (upper === "AM") {
        if (hours === 12) hours = 0;
      } else if (upper === "PM") {
        if (hours !== 12) hours += 12;
      }
      return `${String(hours).padStart(2, "0")}:${mStr}`;
    }
  );
}

/**
 * Formats an ISO timestamp in Europe/Bucharest as "DD-MM-YYYY HH:MM" (24-hour).
 */
export function formatBucharestDateTime(isoTimestamp: string): string {
  const dt = new Date(isoTimestamp);
  if (Number.isNaN(dt.getTime())) {
    return isoTimestamp;
  }
  const parts = getBucharestNowParts(dt);
  return `${formatDisplayDate(parts.date)} ${parts.time}`;
}

/**
 * Returns all YYYY-MM month keys from `from` (YYYY-MM-DD) to `to` (YYYY-MM-DD) inclusive.
 */
export function getMonthsInRange(from: string, to: string): string[] {
  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);
  const parsedFrom = parseMonthKey(fromMonth);
  const parsedTo = parseMonthKey(toMonth);
  if (!parsedFrom || !parsedTo || fromMonth > toMonth) {
    return [];
  }

  const months: string[] = [];
  let y = parsedFrom.year;
  let m = parsedFrom.month1Based;
  while (y < parsedTo.year || (y === parsedTo.year && m <= parsedTo.month1Based)) {
    months.push(formatMonthKey(y, m));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}
