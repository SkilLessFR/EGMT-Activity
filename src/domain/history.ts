import ExcelJS from "exceljs";
import {
  formatBucharestDateTime,
  formatDisplayDate,
  getBucharestDate,
  getBucharestTime,
  getMonthsInRange,
  parseMonthKey,
} from "../shared/timezone";
import type {
  HistoryCategory,
  HistoryItem,
  MaintenanceTask,
  MaintenanceWindow,
  ScheduledMaintenanceLog,
  TaskCompletion,
  TemplateLogEntry,
} from "../shared/types";

export interface HistoryFilterOptions {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
  employee?: string;
  task?: string;
  category?: HistoryCategory;
  sortOrder?: "desc" | "asc";
}

export interface BuildHistoryInput {
  dailyCompletions: TaskCompletion[];
  maintenanceCompletions: TaskCompletion[];
  maintenanceTasks?: MaintenanceTask[];
  scheduledLogs?: ScheduledMaintenanceLog[];
  templateLogs?: TemplateLogEntry[];
  filters: HistoryFilterOptions;
}

export interface ScheduledMaintenanceSlot {
  scheduledDate: string; // YYYY-MM-DD
  window: MaintenanceWindow;
}

/**
 * Returns the 1-based day of month for the nth occurrence (1 = first, 3 = third)
 * of `targetDayOfWeek` (0 = Sun .. 6 = Sat) in `(year, month1Based)`.
 */
function getNthWeekdayOfMonth(
  year: number,
  month1Based: number,
  targetDayOfWeek: number,
  nth: number
): number | null {
  const firstDayOfWeek = new Date(Date.UTC(year, month1Based - 1, 1)).getUTCDay();
  const offset = (targetDayOfWeek - firstDayOfWeek + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  const daysInMonth = new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
  return day <= daysInMonth ? day : null;
}

function formatIsoDate(year: number, month1Based: number, day: number): string {
  return `${year}-${String(month1Based).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Calculates all scheduled maintenance dates for a given month:
 * - MORNING: 1st Monday, 1st Tuesday, 1st Wednesday
 * - NIGHT: 3rd Monday, 3rd Tuesday, 3rd Wednesday
 */
export function getMonthlyMaintenanceSlots(
  year: number,
  month1Based: number
): ScheduledMaintenanceSlot[] {
  const slots: ScheduledMaintenanceSlot[] = [];
  const weekdays = [1, 2, 3]; // Monday, Tuesday, Wednesday

  for (const wd of weekdays) {
    const morningDay = getNthWeekdayOfMonth(year, month1Based, wd, 1);
    if (morningDay !== null) {
      slots.push({
        scheduledDate: formatIsoDate(year, month1Based, morningDay),
        window: "MORNING",
      });
    }
  }

  for (const wd of weekdays) {
    const nightDay = getNthWeekdayOfMonth(year, month1Based, wd, 3);
    if (nightDay !== null) {
      slots.push({
        scheduledDate: formatIsoDate(year, month1Based, nightDay),
        window: "NIGHT",
      });
    }
  }

  slots.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  return slots;
}

/**
 * Returns all scheduled maintenance slots whose scheduledDate falls within [from, to] inclusive.
 */
export function getMaintenanceSlotsInRange(
  from: string,
  to: string
): ScheduledMaintenanceSlot[] {
  const months = getMonthsInRange(from, to);
  const slots: ScheduledMaintenanceSlot[] = [];

  for (const monthKey of months) {
    const parsed = parseMonthKey(monthKey);
    if (!parsed) continue;
    const monthSlots = getMonthlyMaintenanceSlots(
      parsed.year,
      parsed.month1Based
    );
    for (const slot of monthSlots) {
      if (slot.scheduledDate >= from && slot.scheduledDate <= to) {
        slots.push(slot);
      }
    }
  }

  slots.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  return slots;
}

export function completionToHistoryItem(completion: TaskCompletion): HistoryItem {
  return {
    id: completion.id,
    occurrenceId: completion.occurrenceId,
    taskId: completion.taskId,
    taskType: completion.taskType,
    taskTitle: completion.taskTitle,
    scheduledDate: completion.scheduledDate,
    scheduledTime: completion.scheduledTime,
    window: completion.window,
    completedBy: completion.completedBy,
    completedAt: completion.completedAt,
    status: "Completed",
  };
}

/**
 * Builds maintenance history items for a date range [from, to], including:
 * - Every employee completion row for scheduled or historical maintenance
 * - Pending rows for enabled maintenance tasks with no completions on scheduled dates in [from, to]
 */
export function buildMaintenanceRangeItems(
  maintenanceTasks: MaintenanceTask[],
  maintenanceCompletions: TaskCompletion[],
  from: string,
  to: string
): HistoryItem[] {
  const items: HistoryItem[] = [];
  const emittedCompletionIds = new Set<string>();

  const completionsInRange = maintenanceCompletions.filter(
    (c) =>
      c.taskType === "MAINTENANCE" &&
      c.scheduledDate >= from &&
      c.scheduledDate <= to
  );

  const slots = getMaintenanceSlotsInRange(from, to);
  const enabledTasks = maintenanceTasks.filter((t) => t.enabled);

  for (const slot of slots) {
    const tasksForWindow = enabledTasks.filter((t) => t.window === slot.window);
    for (const task of tasksForWindow) {
      const matching = completionsInRange.filter(
        (c) =>
          c.taskId === task.id &&
          c.scheduledDate === slot.scheduledDate &&
          (c.window === undefined || c.window === slot.window)
      );

      if (matching.length > 0) {
        for (const completion of matching) {
          emittedCompletionIds.add(completion.id);
          items.push({
            ...completionToHistoryItem(completion),
            window: completion.window ?? slot.window,
          });
        }
      } else {
        items.push({
          id: `pending:${task.id}:${slot.scheduledDate}:${slot.window}`,
          occurrenceId: `${task.id}:${slot.scheduledDate}:${slot.window}`,
          taskId: task.id,
          taskType: "MAINTENANCE",
          taskTitle: task.title,
          scheduledDate: slot.scheduledDate,
          window: slot.window,
          completedBy: null,
          completedAt: null,
          status: "Pending",
        });
      }
    }
  }

  // Preserve historical completions for tasks that were deleted, disabled, or renamed
  for (const completion of completionsInRange) {
    if (!emittedCompletionIds.has(completion.id)) {
      items.push(completionToHistoryItem(completion));
    }
  }

  return items;
}

function compareHistoryItems(
  a: HistoryItem,
  b: HistoryItem,
  sortOrder: "desc" | "asc"
): number {
  const dir = sortOrder === "asc" ? 1 : -1;

  if (a.scheduledDate !== b.scheduledDate) {
    return a.scheduledDate.localeCompare(b.scheduledDate) * dir;
  }

  const aTime = a.completedAt ?? (a.scheduledTime ? `${a.scheduledDate}T${a.scheduledTime}` : "");
  const bTime = b.completedAt ?? (b.scheduledTime ? `${b.scheduledDate}T${b.scheduledTime}` : "");
  if (aTime !== bTime) {
    return aTime.localeCompare(bTime) * dir;
  }

  const titleCmp = a.taskTitle.localeCompare(b.taskTitle);
  if (titleCmp !== 0) return titleCmp;

  return (a.completedBy ?? "").localeCompare(b.completedBy ?? "");
}

/**
 * Filters and sorts HistoryItem[] according to inclusive date range, employee, task search, category, and sortOrder.
 */
export function filterHistoryItems(
  items: HistoryItem[],
  filters: HistoryFilterOptions
): HistoryItem[] {
  const category = filters.category ?? "ALL";
  const employeeQuery = filters.employee?.trim().toLowerCase() ?? "";
  const taskQuery = filters.task?.trim().toLowerCase() ?? "";
  const sortOrder = filters.sortOrder ?? "desc";

  const filtered = items.filter((item) => {
    if (item.scheduledDate < filters.from || item.scheduledDate > filters.to) {
      return false;
    }

    if (category !== "ALL" && item.taskType !== category) {
      return false;
    }

    if (employeeQuery) {
      if (!item.completedBy) return false;
      if (!item.completedBy.toLowerCase().includes(employeeQuery)) {
        return false;
      }
    }

    if (taskQuery) {
      if (!item.taskTitle.toLowerCase().includes(taskQuery)) {
        return false;
      }
    }

    return true;
  });

  return filtered.sort((a, b) => compareHistoryItems(a, b, sortOrder));
}

/**
 * Builds unified, filtered, and sorted history items from daily and maintenance data.
 */
export function buildUnifiedHistory(input: BuildHistoryInput): HistoryItem[] {
  const {
    dailyCompletions,
    maintenanceCompletions,
    maintenanceTasks,
    scheduledLogs,
    templateLogs,
    filters,
  } = input;
  const category = filters.category ?? "ALL";
  const items: HistoryItem[] = [];

  if (category === "ALL" || category === "DAILY") {
    for (const completion of dailyCompletions) {
      if (completion.taskType === "DAILY") {
        items.push(completionToHistoryItem(completion));
      }
    }
  }

  if (category === "ALL" || category === "MAINTENANCE") {
    if (maintenanceTasks) {
      items.push(
        ...buildMaintenanceRangeItems(
          maintenanceTasks,
          maintenanceCompletions,
          filters.from,
          filters.to
        )
      );
    } else {
      for (const completion of maintenanceCompletions) {
        if (completion.taskType === "MAINTENANCE") {
          items.push(completionToHistoryItem(completion));
        }
      }
    }
  }

  if (
    (category === "ALL" || category === "SCHEDULED") &&
    Array.isArray(scheduledLogs)
  ) {
    for (const log of scheduledLogs) {
      const scheduledDate = getBucharestDate(new Date(log.changedAt));
      const locPart = log.location ? ` (${log.location})` : "";
      const notesPart = log.notes ? ` · ${log.notes}` : "";
      items.push({
        id: log.id,
        occurrenceId: log.itemId,
        taskId: log.itemId,
        taskType: "SCHEDULED",
        taskTitle: `${log.itemName}${locPart}${notesPart}`,
        scheduledDate,
        completedBy: log.changedBy,
        completedAt: log.changedAt,
        status: "Completed",
      });
    }
  }

  if (
    (category === "ALL" || category === "TEMPLATE") &&
    Array.isArray(templateLogs)
  ) {
    for (const entry of templateLogs) {
      const snPart =
        entry.oldSerialNumber || entry.newSerialNumber
          ? ` · Old SN: ${entry.oldSerialNumber ?? "—"} → New SN: ${entry.newSerialNumber ?? "—"}`
          : "";
      const commentPart = entry.comment ? ` · ${entry.comment}` : "";
      items.push({
        id: entry.id,
        occurrenceId: entry.id,
        taskId: entry.templateId,
        taskType: "TEMPLATE",
        taskTitle: `${entry.category} · ${entry.optionName} (Studio ${entry.studio})${snPart}${commentPart}`,
        scheduledDate: entry.loggedDate,
        scheduledTime: getBucharestTime(new Date(entry.loggedAt)),
        completedBy: entry.completedBy.join(", "),
        completedAt: entry.loggedAt,
        status: "Completed",
        ...(entry.photos && entry.photos.length > 0
          ? { photos: entry.photos }
          : {}),
      });
    }
  }

  return filterHistoryItems(items, filters);
}

function styleHeaderRow(worksheet: ExcelJS.Worksheet, columnCount: number): void {
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E293B" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };
  headerRow.height = 24;

  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columnCount },
  };
}

function applyAutoColumnWidths(
  worksheet: ExcelJS.Worksheet,
  minWidth = 14,
  maxWidth = 48
): void {
  worksheet.columns.forEach((column) => {
    let maxLength = minWidth;
    if (column.eachCell) {
      column.eachCell({ includeEmpty: true }, (cell) => {
        const val = cell.value;
        const text = val === null || val === undefined ? "" : String(val);
        if (text.length + 3 > maxLength) {
          maxLength = text.length + 3;
        }
      });
    }
    column.width = Math.min(maxLength, maxWidth);
  });
}

/**
 * Generates an Excel (.xlsx) workbook buffer for Daily Tasks in [from, to].
 */
export async function generateDailyExportBuffer(
  dailyCompletions: TaskCompletion[],
  from: string,
  to: string
): Promise<Uint8Array> {
  const items = filterHistoryItems(
    dailyCompletions
      .filter((c) => c.taskType === "DAILY")
      .map(completionToHistoryItem),
    { from, to, category: "DAILY", sortOrder: "asc" }
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EGMT-Activity";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Daily Tasks");
  worksheet.columns = [
    { header: "Task Title", key: "taskTitle", width: 32 },
    { header: "Scheduled Date", key: "scheduledDate", width: 16 },
    { header: "Scheduled Time", key: "scheduledTime", width: 16 },
    { header: "Completed By", key: "completedBy", width: 24 },
    {
      header: "Completed At (Europe/Bucharest)",
      key: "completedAt",
      width: 28,
    },
    { header: "Status", key: "status", width: 14 },
  ];

  for (const item of items) {
    worksheet.addRow({
      taskTitle: item.taskTitle,
      scheduledDate: formatDisplayDate(item.scheduledDate),
      scheduledTime: item.scheduledTime ?? "",
      completedBy: item.completedBy ?? "",
      completedAt: item.completedAt
        ? formatBucharestDateTime(item.completedAt)
        : "",
      status: item.status,
    });
  }

  styleHeaderRow(worksheet, 6);
  applyAutoColumnWidths(worksheet);

  const rawBuffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(rawBuffer);
}

/**
 * Generates an Excel (.xlsx) workbook buffer for Downtime Maintenance in [from, to],
 * including every employee completion row and pending scheduled occurrences.
 */
export async function generateDowntimeExportBuffer(
  maintenanceTasks: MaintenanceTask[],
  maintenanceCompletions: TaskCompletion[],
  from: string,
  to: string
): Promise<Uint8Array> {
  const rawItems = buildMaintenanceRangeItems(
    maintenanceTasks,
    maintenanceCompletions,
    from,
    to
  );
  const items = filterHistoryItems(rawItems, {
    from,
    to,
    category: "MAINTENANCE",
    sortOrder: "asc",
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EGMT-Activity";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Downtime Maintenance");
  worksheet.columns = [
    { header: "Task Title", key: "taskTitle", width: 32 },
    { header: "Window (MORNING/NIGHT)", key: "window", width: 24 },
    { header: "Scheduled Date", key: "scheduledDate", width: 16 },
    { header: "Status (Completed/Pending)", key: "status", width: 24 },
    { header: "Completed By", key: "completedBy", width: 24 },
    {
      header: "Completed At (Europe/Bucharest)",
      key: "completedAt",
      width: 28,
    },
  ];

  for (const item of items) {
    worksheet.addRow({
      taskTitle: item.taskTitle,
      window: item.window ?? "",
      scheduledDate: formatDisplayDate(item.scheduledDate),
      status: item.status,
      completedBy: item.completedBy ?? "",
      completedAt: item.completedAt
        ? formatBucharestDateTime(item.completedAt)
        : "",
    });
  }

  styleHeaderRow(worksheet, 6);
  applyAutoColumnWidths(worksheet);

  const rawBuffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(rawBuffer);
}
