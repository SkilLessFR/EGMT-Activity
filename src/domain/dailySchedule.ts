import {
  getBucharestDayOfWeek,
  getNextCalendarDate,
  getPreviousCalendarDate,
} from "../shared/timezone";
import type {
  DailyOccurrence,
  DailyOccurrenceStatus,
  DailyTask,
  RosterData,
  Shift,
  TargetShift,
  TaskCompletion,
} from "../shared/types";

export interface ShiftLookup {
  shift: Shift;
  usePreviousDay: boolean;
}

export function getShiftStartTime(targetShift: TargetShift): string {
  switch (targetShift) {
    case "M":
      return "06:00";
    case "A":
      return "14:00";
    case "N":
      return "22:00";
    case "MID":
      return "09:00";
    case "ALL_ACTIVE":
      return "06:00";
  }
}

/**
 * Parses "HH:MM" into minutes since midnight (0..1439).
 */
export function parseTimeToMinutes(timeHHMM: string): number {
  const [hStr, mStr] = timeHHMM.split(":");
  return Number(hStr) * 60 + Number(mStr);
}

/**
 * Returns deterministic occurrenceId encoding taskId, scheduledDate, and scheduledTime.
 */
export function buildDailyOccurrenceId(
  taskId: string,
  scheduledDate: string,
  scheduledTime: string
): string {
  return `daily:${taskId}:${scheduledDate}:${scheduledTime}`;
}

/**
 * Returns which shifts are active at a given HH:MM time in Europe/Bucharest.
 *
 * Shift hours:
 * - M:   06:00 - 14:00 ([06:00, 14:00))
 * - MID: 09:00 - 17:00 ([09:00, 17:00))
 * - A:   14:00 - 22:00 ([14:00, 22:00))
 * - N:   22:00 - 06:00 ([22:00, 24:00) on date D, [00:00, 06:00) from date D-1)
 */
export function getActiveShiftsAtTime(timeHHMM: string): ShiftLookup[] {
  const mins = parseTimeToMinutes(timeHHMM);
  const active: ShiftLookup[] = [];

  // 00:00 - 05:59 -> Night shift from previous calendar day (D-1)
  if (mins >= 0 && mins < 6 * 60) {
    active.push({ shift: "N", usePreviousDay: true });
    return active;
  }

  // 06:00 - 13:59 -> M shift
  if (mins >= 6 * 60 && mins < 14 * 60) {
    active.push({ shift: "M", usePreviousDay: false });
  }

  // 09:00 - 16:59 -> MID shift (overlaps M 09:00-14:00 and A 14:00-17:00)
  if (mins >= 9 * 60 && mins < 17 * 60) {
    active.push({ shift: "MID", usePreviousDay: false });
  }

  // 14:00 - 21:59 -> A shift
  if (mins >= 14 * 60 && mins < 22 * 60) {
    active.push({ shift: "A", usePreviousDay: false });
  }

  // 22:00 - 23:59 -> N shift on current calendar day (D)
  if (mins >= 22 * 60) {
    active.push({ shift: "N", usePreviousDay: false });
  }

  return active;
}

function getEmployeesForShiftOnDate(
  roster: RosterData | null | undefined,
  date: string,
  shift: Shift
): string[] {
  if (!roster) return [];
  const result: string[] = [];
  for (const employee of roster.employees) {
    const empRow = roster.rows[employee];
    if (empRow && empRow[date] === shift) {
      result.push(employee);
    }
  }
  return result;
}

/**
 * Determines eligible employees from RosterData (and previous day's RosterData
 * when midnight-crossing N shift is active between 00:00 and 05:59).
 */
export function getEligibleEmployeesForDailyTask(params: {
  targetShift: TargetShift;
  scheduledDate: string;
  scheduledTime: string;
  currentRoster?: RosterData | null;
  previousRoster?: RosterData | null;
  previousDate?: string;
}): string[] {
  const {
    targetShift,
    scheduledDate,
    scheduledTime,
    currentRoster,
    previousRoster,
    previousDate,
  } = params;

  const prevDate = previousDate ?? getPreviousCalendarDate(scheduledDate);
  const mins = parseTimeToMinutes(scheduledTime);

  if (targetShift === "ALL_ACTIVE") {
    const activeLookups = getActiveShiftsAtTime(scheduledTime);
    const seen = new Set<string>();
    const eligible: string[] = [];

    for (const lookup of activeLookups) {
      const rosterToUse = lookup.usePreviousDay
        ? (previousRoster ?? currentRoster)
        : currentRoster;
      const dateToUse = lookup.usePreviousDay ? prevDate : scheduledDate;
      const emps = getEmployeesForShiftOnDate(
        rosterToUse,
        dateToUse,
        lookup.shift
      );
      for (const emp of emps) {
        if (!seen.has(emp)) {
          seen.add(emp);
          eligible.push(emp);
        }
      }
    }

    return eligible;
  }

  // Specific targetShift
  if (targetShift === "N" && mins >= 0 && mins < 6 * 60) {
    // Between 00:00 and 05:59 on date D, N shift active is from date D-1
    const rosterToUse = previousRoster ?? currentRoster;
    return getEmployeesForShiftOnDate(rosterToUse, prevDate, "N");
  }

  return getEmployeesForShiftOnDate(currentRoster, scheduledDate, targetShift);
}

/**
 * Checks whether a DailyTask is scheduled to run on the given YYYY-MM-DD date.
 */
export function isDailyTaskScheduledOnDate(
  task: DailyTask,
  dateStr: string
): boolean {
  if (!task.enabled) return false;

  switch (task.schedule.type) {
    case "once":
      return task.schedule.date === dateStr;
    case "daily":
      return true;
    case "weekly": {
      const dayOfWeek = getBucharestDayOfWeek(dateStr);
      return task.schedule.daysOfWeek.includes(dayOfWeek);
    }
    case "interval": {
      if (task.schedule.everyDays < 1 || dateStr < task.schedule.startDate) {
        return false;
      }
      const startMs = Date.parse(`${task.schedule.startDate}T00:00:00Z`);
      const targetMs = Date.parse(`${dateStr}T00:00:00Z`);
      const diffDays = Math.round((targetMs - startMs) / 86_400_000);
      return diffDays >= 0 && diffDays % task.schedule.everyDays === 0;
    }
  }
}

/**
 * Computes occurrence status relative to current Europe/Bucharest date and time.
 */
export function computeDailyOccurrenceStatus(params: {
  scheduledDate: string;
  scheduledTime: string;
  dueUntil?: string;
  completion: TaskCompletion | null;
  nowDate: string;
  nowTime: string;
  dueWindowMinutes?: number;
}): DailyOccurrenceStatus {
  const {
    scheduledDate,
    scheduledTime,
    dueUntil,
    completion,
    nowDate,
    nowTime,
    dueWindowMinutes = 30,
  } = params;

  if (completion !== null) {
    return "completed";
  }

  const schedMins = parseTimeToMinutes(scheduledTime);
  const nowMins = parseTimeToMinutes(nowTime);

  if (dueUntil !== undefined) {
    const dueUntilMins = parseTimeToMinutes(dueUntil);
    const crossesMidnight = dueUntilMins < schedMins;

    if (crossesMidnight) {
      const nextDate = getNextCalendarDate(scheduledDate);
      if (nowDate < scheduledDate) return "upcoming";
      if (nowDate === scheduledDate) {
        return nowMins < schedMins ? "upcoming" : "dueNow";
      }
      if (nowDate === nextDate) {
        return nowMins <= dueUntilMins ? "dueNow" : "overdue";
      }
      return "overdue";
    }

    if (scheduledDate < nowDate) return "overdue";
    if (scheduledDate > nowDate) return "upcoming";
    if (nowMins < schedMins) return "upcoming";
    if (nowMins <= dueUntilMins) return "dueNow";
    return "overdue";
  }

  if (scheduledDate < nowDate) {
    return "overdue";
  }
  if (scheduledDate > nowDate) {
    return "upcoming";
  }

  if (nowMins < schedMins) {
    return "upcoming";
  }
  if (nowMins - schedMins <= dueWindowMinutes) {
    return "dueNow";
  }
  return "overdue";
}

/**
 * Generates sorted DailyOccurrence[] for a selected YYYY-MM-DD date.
 */
export function generateDailyOccurrences(params: {
  tasks: DailyTask[];
  selectedDate: string;
  completions: TaskCompletion[];
  currentRoster?: RosterData | null;
  previousRoster?: RosterData | null;
  nowDate?: string;
  nowTime?: string;
  dueWindowMinutes?: number;
}): DailyOccurrence[] {
  const {
    tasks,
    selectedDate,
    completions,
    currentRoster,
    previousRoster,
    nowDate = selectedDate,
    nowTime = "00:00",
    dueWindowMinutes = 30,
  } = params;

  const completionByOccurrenceId = new Map<string, TaskCompletion>();
  for (const c of completions) {
    if (c.taskType === "DAILY") {
      completionByOccurrenceId.set(c.occurrenceId, c);
    }
  }

  const occurrences: DailyOccurrence[] = [];
  const prevDate = getPreviousCalendarDate(selectedDate);

  for (const task of tasks) {
    if (!isDailyTaskScheduledOnDate(task, selectedDate)) {
      continue;
    }

    const uniqueTimes = Array.from(new Set(task.times)).sort();
    for (const scheduledTime of uniqueTimes) {
      const occurrenceId = buildDailyOccurrenceId(
        task.id,
        selectedDate,
        scheduledTime
      );
      const completion = completionByOccurrenceId.get(occurrenceId) ?? null;
      const eligibleEmployees = getEligibleEmployeesForDailyTask({
        targetShift: task.targetShift,
        scheduledDate: selectedDate,
        scheduledTime,
        currentRoster,
        previousRoster,
        previousDate: prevDate,
      });

      const status = computeDailyOccurrenceStatus({
        scheduledDate: selectedDate,
        scheduledTime,
        dueUntil: task.dueUntil,
        completion,
        nowDate,
        nowTime,
        dueWindowMinutes,
      });

      occurrences.push({
        occurrenceId,
        taskId: task.id,
        taskTitle: task.title,
        taskDescription: task.description,
        targetShift: task.targetShift,
        scheduledDate: selectedDate,
        scheduledTime,
        ...(task.dueUntil !== undefined ? { dueUntil: task.dueUntil } : {}),
        eligibleEmployees,
        status,
        completion,
      });
    }
  }

  occurrences.sort((a, b) => {
    const timeCmp = a.scheduledTime.localeCompare(b.scheduledTime);
    if (timeCmp !== 0) return timeCmp;
    return a.taskTitle.localeCompare(b.taskTitle);
  });

  return occurrences;
}

export interface CurrentShiftWindow {
  primaryShift: "M" | "A" | "N";
  activeShifts: Shift[];
  nightHalf: "first" | "second" | null;
}

/**
 * Returns the active shift(s) and night-shift half for a given HH:MM time in Europe/Bucharest.
 * Night shift spans two calendar days:
 * - "first": 22:00–23:59 (first calendar day)
 * - "second": 00:00–05:59 (second calendar day)
 */
export function getCurrentShiftWindow(nowTime: string): CurrentShiftWindow {
  const mins = parseTimeToMinutes(nowTime);
  const activeShifts = getActiveShiftsAtTime(nowTime).map((s) => s.shift);

  if (mins >= 6 * 60 && mins < 14 * 60) {
    return { primaryShift: "M", activeShifts, nightHalf: null };
  }
  if (mins >= 14 * 60 && mins < 22 * 60) {
    return { primaryShift: "A", activeShifts, nightHalf: null };
  }
  if (mins >= 22 * 60) {
    return { primaryShift: "N", activeShifts, nightHalf: "first" };
  }
  return { primaryShift: "N", activeShifts, nightHalf: "second" };
}

function isTimeInCurrentWindow(
  scheduledTime: string,
  window: CurrentShiftWindow
): boolean {
  const mins = parseTimeToMinutes(scheduledTime);
  if (window.primaryShift === "M") {
    return mins >= 6 * 60 && mins < 14 * 60;
  }
  if (window.primaryShift === "A") {
    return mins >= 14 * 60 && mins < 22 * 60;
  }
  if (window.nightHalf === "first") {
    return mins >= 22 * 60;
  }
  return mins < 6 * 60;
}

/**
 * Filters occurrences to only those relevant to the current shift at `nowTime`.
 * Handles Night shift spanning 2 calendar days:
 * - 22:00–23:59 ("first"): shows Night/ALL_ACTIVE tasks in 22:00–23:59 of selectedDate.
 * - 00:00–05:59 ("second"):
 *   - On selectedDate === nowDate (second day): shows Night/ALL_ACTIVE tasks in 00:00–05:59
 *     of selectedDate, plus all first-half (22:00–23:59) and overnight dueUntil Night/ALL_ACTIVE
 *     tasks from prevDate so the entire 22:00–06:00 shift stays visible in one place.
 *   - On selectedDate < nowDate (e.g. stepping back to first day): shows 22:00–23:59 of
 *     selectedDate rather than 00:00–05:59 of the previous night's shift.
 */
export function filterOccurrencesForCurrentShift(params: {
  occurrences: DailyOccurrence[];
  prevDateOccurrences?: DailyOccurrence[];
  nowTime: string;
  selectedDate?: string;
  nowDate?: string;
}): DailyOccurrence[] {
  const {
    occurrences,
    prevDateOccurrences = [],
    nowTime,
    selectedDate,
    nowDate,
  } = params;
  const window = getCurrentShiftWindow(nowTime);
  const activeSet = new Set<Shift>(window.activeShifts);

  // If currently in 00:00–05:59 (second half) and user steps back to an earlier date
  // (e.g. the first day of the current night shift), show 22:00–23:59 of that date.
  const effectiveWindow: CurrentShiftWindow =
    window.primaryShift === "N" &&
    window.nightHalf === "second" &&
    selectedDate &&
    nowDate &&
    selectedDate < nowDate
      ? { ...window, nightHalf: "first" }
      : window;

  const filtered = occurrences.filter((occ) => {
    if (occ.targetShift === "ALL_ACTIVE") {
      return isTimeInCurrentWindow(occ.scheduledTime, effectiveWindow);
    }
    if (occ.targetShift === "N") {
      if (effectiveWindow.primaryShift !== "N") return false;
      return isTimeInCurrentWindow(occ.scheduledTime, effectiveWindow);
    }
    return activeSet.has(occ.targetShift);
  });

  if (effectiveWindow.primaryShift === "N" && effectiveWindow.nightHalf === "second") {
    const seen = new Set(filtered.map((o) => o.occurrenceId));
    const carriedFromPrev = prevDateOccurrences.filter((occ) => {
      if (seen.has(occ.occurrenceId)) return false;
      if (occ.targetShift !== "N" && occ.targetShift !== "ALL_ACTIVE") return false;
      const isOvernightDueUntil =
        Boolean(occ.dueUntil) &&
        parseTimeToMinutes(occ.dueUntil!) < parseTimeToMinutes(occ.scheduledTime);
      const isFirstHalfNight = parseTimeToMinutes(occ.scheduledTime) >= 22 * 60;
      return isOvernightDueUntil || isFirstHalfNight;
    });
    return [...carriedFromPrev, ...filtered];
  }

  return filtered;
}

export interface GroupedDailyOccurrences {
  overdue: DailyOccurrence[];
  dueNow: DailyOccurrence[];
  upcoming: DailyOccurrence[];
  completed: DailyOccurrence[];
}

/**
 * Groups DailyOccurrence[] into overdue, dueNow, upcoming, and completed buckets.
 */
export function groupDailyOccurrences(
  occurrences: DailyOccurrence[]
): GroupedDailyOccurrences {
  const grouped: GroupedDailyOccurrences = {
    overdue: [],
    dueNow: [],
    upcoming: [],
    completed: [],
  };

  for (const occ of occurrences) {
    grouped[occ.status].push(occ);
  }

  return grouped;
}
