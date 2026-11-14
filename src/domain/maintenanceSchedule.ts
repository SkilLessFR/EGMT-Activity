import type {
  MaintenanceOccurrence,
  MaintenanceTask,
  MaintenanceWindow,
  RosterData,
  RosterShift,
  TaskCompletion,
} from "../shared/types";
import { formatMonthKey, getMonthsInRange, parseMonthKey } from "../shared/timezone";

export interface MonthlyMaintenanceDates {
  MORNING: string[];
  NIGHT: string[];
}

function formatIsoDate(year: number, month1Based: number, day: number): string {
  return `${year}-${String(month1Based).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Returns the YYYY-MM-DD date for the nth occurrence (1-based) of targetDayOfWeek (0=Sun..6=Sat)
 * in the given (year, month1Based).
 */
function getNthWeekdayOfMonth(
  year: number,
  month1Based: number,
  targetDayOfWeek: number,
  nth: number
): string {
  const firstDayOfWeek = new Date(Date.UTC(year, month1Based - 1, 1)).getUTCDay();
  const offset = (targetDayOfWeek - firstDayOfWeek + 7) % 7;
  const dayOfMonth = 1 + offset + (nth - 1) * 7;
  return formatIsoDate(year, month1Based, dayOfMonth);
}

/**
 * Dynamically calculates the fixed monthly maintenance dates for any (year, month1Based):
 * - MORNING: First Monday, First Tuesday, First Wednesday of the month (M shift, 06:00-14:00)
 * - NIGHT: Third Monday, Third Tuesday, Third Wednesday of the month (N shift, 22:00-06:00)
 *
 * Returned arrays are sorted chronologically (YYYY-MM-DD).
 */
export function getMaintenanceDatesForMonth(
  year: number,
  month1Based: number
): MonthlyMaintenanceDates {
  if (!Number.isInteger(year) || !Number.isInteger(month1Based) || month1Based < 1 || month1Based > 12) {
    throw new Error(`Invalid year/month1Based: (${year}, ${month1Based})`);
  }

  const weekdays = [1, 2, 3]; // Monday, Tuesday, Wednesday

  const morning = weekdays
    .map((dow) => getNthWeekdayOfMonth(year, month1Based, dow, 1))
    .sort((a, b) => a.localeCompare(b));

  const night = weekdays
    .map((dow) => getNthWeekdayOfMonth(year, month1Based, dow, 3))
    .sort((a, b) => a.localeCompare(b));

  return {
    MORNING: morning,
    NIGHT: night,
  };
}

export function getMaintenanceDatesForWindow(
  year: number,
  month1Based: number,
  window: MaintenanceWindow
): string[] {
  return getMaintenanceDatesForMonth(year, month1Based)[window];
}

/**
 * Deterministic occurrenceId encoding taskId, scheduledDate (YYYY-MM-DD), and window.
 */
export function buildMaintenanceOccurrenceId(
  taskId: string,
  scheduledDate: string,
  window: MaintenanceWindow
): string {
  return `maint:${taskId}:${scheduledDate}:${window}`;
}

/**
 * Determines eligible employees from RosterData for a maintenance occurrence:
 * - MORNING -> employees on "M" shift on scheduledDate
 * - NIGHT -> employees on "N" shift on scheduledDate (date N shift starts)
 */
export function getEligibleMaintenanceEmployees(
  roster: RosterData | null | undefined,
  scheduledDate: string,
  window: MaintenanceWindow
): string[] {
  if (!roster) return [];
  const targetShift: RosterShift = window === "MORNING" ? "M" : "N";
  const eligible: string[] = [];

  for (const employee of roster.employees) {
    const empRow = roster.rows[employee];
    if (empRow && empRow[scheduledDate] === targetShift) {
      eligible.push(employee);
    }
  }

  return eligible;
}

export interface GenerateMaintenanceOccurrencesInput {
  year: number;
  month1Based: number;
  tasks: MaintenanceTask[];
  completions?: TaskCompletion[];
  roster?: RosterData | null;
}

function sortCompletionsChronologically(completions: TaskCompletion[]): TaskCompletion[] {
  return [...completions].sort((a, b) => {
    const timeCmp = a.completedAt.localeCompare(b.completedAt);
    if (timeCmp !== 0) return timeCmp;
    return a.completedBy.localeCompare(b.completedBy);
  });
}

function compareOccurrences(a: MaintenanceOccurrence, b: MaintenanceOccurrence): number {
  const dateCmp = a.scheduledDate.localeCompare(b.scheduledDate);
  if (dateCmp !== 0) return dateCmp;

  if (a.window !== b.window) {
    return a.window === "MORNING" ? -1 : 1;
  }

  const titleCmp = a.taskTitle.localeCompare(b.taskTitle);
  if (titleCmp !== 0) return titleCmp;

  return a.taskId.localeCompare(b.taskId);
}

/**
 * Generates MaintenanceOccurrence[] for a given (year, month1Based):
 * - Creates occurrences for enabled MaintenanceTask definitions on that month's MORNING/NIGHT dates.
 * - Merges all employee TaskCompletion records per occurrenceId.
 * - Reconstructs historical occurrences from completion snapshots when a task was disabled,
 *   deleted, or modified so historical completions are never lost.
 */
export function generateMaintenanceOccurrencesForMonth(
  input: GenerateMaintenanceOccurrencesInput
): MaintenanceOccurrence[] {
  const { year, month1Based, tasks, completions = [], roster = null } = input;
  const monthPrefix = formatMonthKey(year, month1Based);
  const monthDates = getMaintenanceDatesForMonth(year, month1Based);

  const completionsByOccurrence = new Map<string, TaskCompletion[]>();
  for (const completion of completions) {
    if (
      completion.taskType !== "MAINTENANCE" ||
      !completion.scheduledDate.startsWith(monthPrefix)
    ) {
      continue;
    }
    const existing = completionsByOccurrence.get(completion.occurrenceId);
    if (existing) {
      existing.push(completion);
    } else {
      completionsByOccurrence.set(completion.occurrenceId, [completion]);
    }
  }

  const occurrences: MaintenanceOccurrence[] = [];
  const handledOccurrenceIds = new Set<string>();

  for (const task of tasks) {
    if (!task.enabled) {
      continue;
    }

    const dates = monthDates[task.window];
    for (const scheduledDate of dates) {
      const occurrenceId = buildMaintenanceOccurrenceId(
        task.id,
        scheduledDate,
        task.window
      );
      handledOccurrenceIds.add(occurrenceId);

      const rawCompletions = completionsByOccurrence.get(occurrenceId) ?? [];
      const sortedCompletions = sortCompletionsChronologically(rawCompletions);
      const completionCount = sortedCompletions.length;

      occurrences.push({
        occurrenceId,
        taskId: task.id,
        taskTitle: task.title,
        taskDescription: task.description,
        window: task.window,
        scheduledDate,
        eligibleEmployees: getEligibleMaintenanceEmployees(
          roster,
          scheduledDate,
          task.window
        ),
        completions: sortedCompletions,
        completionCount,
        status: completionCount >= 1 ? "completed" : "pending",
      });
    }
  }

  // Reconstruct historical occurrences from completion snapshots for disabled/deleted/changed tasks
  const tasksById = new Map<string, MaintenanceTask>(tasks.map((t) => [t.id, t]));
  for (const [occurrenceId, rawCompletions] of completionsByOccurrence.entries()) {
    if (handledOccurrenceIds.has(occurrenceId) || rawCompletions.length === 0) {
      continue;
    }

    const sortedCompletions = sortCompletionsChronologically(rawCompletions);
    const snapshot = sortedCompletions[sortedCompletions.length - 1];
    const window: MaintenanceWindow = snapshot.window ?? "MORNING";
    const maybeTask = tasksById.get(snapshot.taskId);

    occurrences.push({
      occurrenceId,
      taskId: snapshot.taskId,
      taskTitle: snapshot.taskTitle,
      taskDescription: maybeTask?.description,
      window,
      scheduledDate: snapshot.scheduledDate,
      eligibleEmployees: getEligibleMaintenanceEmployees(
        roster,
        snapshot.scheduledDate,
        window
      ),
      completions: sortedCompletions,
      completionCount: sortedCompletions.length,
      status: "completed",
    });
  }

  return occurrences.sort(compareOccurrences);
}

/**
 * Generates MaintenanceOccurrence[] across an inclusive YYYY-MM-DD date range.
 */
export function generateMaintenanceOccurrencesForRange(params: {
  from: string;
  to: string;
  tasks: MaintenanceTask[];
  completions?: TaskCompletion[];
  rostersByMonth?: Record<string, RosterData | null | undefined>;
}): MaintenanceOccurrence[] {
  const { from, to, tasks, completions = [], rostersByMonth = {} } = params;
  const monthKeys = getMonthsInRange(from, to);
  const allOccurrences: MaintenanceOccurrence[] = [];

  for (const monthKey of monthKeys) {
    const parsed = parseMonthKey(monthKey);
    if (!parsed) continue;
    const monthOccurrences = generateMaintenanceOccurrencesForMonth({
      year: parsed.year,
      month1Based: parsed.month1Based,
      tasks,
      completions,
      roster: rostersByMonth[monthKey] ?? null,
    });
    for (const occ of monthOccurrences) {
      if (occ.scheduledDate >= from && occ.scheduledDate <= to) {
        allOccurrences.push(occ);
      }
    }
  }

  return allOccurrences.sort(compareOccurrences);
}
