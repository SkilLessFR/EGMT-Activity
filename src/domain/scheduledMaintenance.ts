import { getBucharestDate } from "../shared/timezone";
import type {
  ScheduledMaintenanceItem,
  ScheduledMaintenanceLog,
  ScheduledMaintenanceStatus,
  ScheduledMaintenanceWithStatus,
} from "../shared/types";

export const DEFAULT_CYCLE_DAYS = 5;
export const DEFAULT_WARNING_DAYS = 1;

/**
 * Default roulette ball-change machines recycled from Roulette-Tracker.
 */
export const DEFAULT_ROULETTE_ITEMS: ScheduledMaintenanceItem[] = [
  {
    id: "A25.1",
    name: "A25.1",
    category: "Roulette Ball Change",
    location: "Afi",
    cycleDays: DEFAULT_CYCLE_DAYS,
    warningDays: DEFAULT_WARNING_DAYS,
    inUse: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "A25.2",
    name: "A25.2",
    category: "Roulette Ball Change",
    location: "Afi",
    cycleDays: DEFAULT_CYCLE_DAYS,
    warningDays: DEFAULT_WARNING_DAYS,
    inUse: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "A25.3",
    name: "A25.3",
    category: "Roulette Ball Change",
    location: "Afi",
    cycleDays: DEFAULT_CYCLE_DAYS,
    warningDays: DEFAULT_WARNING_DAYS,
    inUse: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "RA31.1",
    name: "RA31.1",
    category: "Roulette Ball Change",
    location: "Rahova",
    cycleDays: DEFAULT_CYCLE_DAYS,
    warningDays: DEFAULT_WARNING_DAYS,
    inUse: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "RA 31.3",
    name: "RA 31.3",
    category: "Roulette Ball Change",
    location: "Rahova",
    cycleDays: DEFAULT_CYCLE_DAYS,
    warningDays: DEFAULT_WARNING_DAYS,
    inUse: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "R5.1",
    name: "R5.1",
    category: "Roulette Ball Change",
    location: "Rahova",
    cycleDays: DEFAULT_CYCLE_DAYS,
    warningDays: DEFAULT_WARNING_DAYS,
    inUse: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

function bucharestDayMs(isoTimestamp: string): number {
  const dateStr = getBucharestDate(new Date(isoTimestamp));
  return Date.parse(`${dateStr}T00:00:00Z`);
}

export function addDaysToIsoDate(isoTimestamp: string, days: number): string {
  const dateStr = getBucharestDate(new Date(isoTimestamp));
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function calendarDaysBetweenBucharest(fromIso: string, toIso: string): number {
  return Math.round((bucharestDayMs(toIso) - bucharestDayMs(fromIso)) / 86_400_000);
}

export function calculateScheduledStatus(
  nextDueAt: string | null,
  nowIso: string = new Date().toISOString(),
  warningDays: number = DEFAULT_WARNING_DAYS
): ScheduledMaintenanceStatus {
  if (!nextDueAt) return "grey";
  const daysRemaining = calendarDaysBetweenBucharest(nowIso, nextDueAt);
  if (daysRemaining < 0) return "red";
  if (daysRemaining <= warningDays) return "amber";
  return "green";
}

export function getLatestLogForItem(
  itemId: string,
  logs: ScheduledMaintenanceLog[]
): ScheduledMaintenanceLog | null {
  let latest: ScheduledMaintenanceLog | null = null;
  let latestChangedMs = -Infinity;
  let latestCreatedMs = -Infinity;

  for (const log of logs) {
    if (log.itemId !== itemId) continue;
    const changedMs = Date.parse(log.changedAt);
    const createdMs = Date.parse(log.createdAt);
    if (
      changedMs > latestChangedMs ||
      (changedMs === latestChangedMs && createdMs > latestCreatedMs)
    ) {
      latest = log;
      latestChangedMs = changedMs;
      latestCreatedMs = createdMs;
    }
  }

  return latest;
}

export function computeScheduledMaintenanceStatus(
  item: ScheduledMaintenanceItem,
  logs: ScheduledMaintenanceLog[],
  nowIso: string = new Date().toISOString()
): ScheduledMaintenanceWithStatus {
  const lastLog = getLatestLogForItem(item.id, logs);

  if (!item.inUse) {
    return {
      item,
      status: "not_in_use",
      lastLog,
      nextDueAt: null,
      daysRemaining: null,
      daysElapsed: null,
      progressPercent: 0,
    };
  }

  if (!lastLog) {
    return {
      item,
      status: "grey",
      lastLog: null,
      nextDueAt: null,
      daysRemaining: null,
      daysElapsed: null,
      progressPercent: 0,
    };
  }

  const nextDueAt = addDaysToIsoDate(lastLog.changedAt, item.cycleDays);
  const daysRemaining = calendarDaysBetweenBucharest(nowIso, nextDueAt);
  const daysElapsed = calendarDaysBetweenBucharest(lastLog.changedAt, nowIso);
  const status = calculateScheduledStatus(nextDueAt, nowIso, item.warningDays);
  const clampedRemaining = Math.max(0, Math.min(item.cycleDays, daysRemaining));
  const progressPercent = Math.round(
    ((item.cycleDays - clampedRemaining) / Math.max(1, item.cycleDays)) * 100
  );

  return {
    item,
    status,
    lastLog,
    nextDueAt,
    daysRemaining,
    daysElapsed,
    progressPercent,
  };
}
