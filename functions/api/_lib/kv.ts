import type { KVNamespace } from "@cloudflare/workers-types";
import type { TaskComment, TaskCompletion } from "../../../src/shared/types";

export interface Env {
  EGMT_ACTIVIT: KVNamespace;
}

export const KV_KEYS = {
  dailyTasks: "config:daily-tasks",
  maintenanceTasks: "config:maintenance-tasks",
  scheduledItems: "config:scheduled-maintenance-items",
  scheduledLogs: "log:scheduled-maintenance-changes",
  syncVersion: "sync:version",
} as const;

export async function bumpSyncVersion(kv: KVNamespace): Promise<void> {
  await kv.put(KV_KEYS.syncVersion, String(Date.now()));
}

export function rosterKey(monthKey: string): string {
  return `roster:${monthKey}`;
}

export function downtimeScheduleKey(monthKey: string): string {
  return `downtime:schedule:${monthKey}`;
}

export function normalizeEmployeeKey(employeeName: string): string {
  return encodeURIComponent(employeeName.trim().toLowerCase());
}

export function completionsMonthKey(monthKey: string): string {
  return `completions:month:${monthKey}`;
}

export function commentsMonthKey(monthKey: string): string {
  return `comments:month:${monthKey}`;
}

export function templateLogsMonthKey(monthKey: string): string {
  return `templates:month:${monthKey}`;
}

export function dailyCompletionKey(
  monthKey: string,
  occurrenceId: string
): string {
  return `completion:daily:${monthKey}:${occurrenceId}`;
}

export function maintenanceCompletionKey(
  monthKey: string,
  occurrenceId: string,
  employeeNameOrKey: string
): string {
  return `completion:maintenance:${monthKey}:${occurrenceId}:${normalizeEmployeeKey(employeeNameOrKey)}`;
}

export function completionDailyPrefix(monthKey: string): string {
  return `completion:daily:${monthKey}:`;
}

export function completionMaintenancePrefix(monthKey: string): string {
  return `completion:maintenance:${monthKey}:`;
}

export function completionMaintenanceOccurrencePrefix(
  monthKey: string,
  occurrenceId: string
): string {
  return `completion:maintenance:${monthKey}:${occurrenceId}:`;
}

/**
 * Lists all KV keys matching a prefix across all pagination cursors.
 */
export async function listAllKeys(
  kv: KVNamespace,
  prefix: string
): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const result = await kv.list({ prefix, cursor });
    for (const key of result.keys) {
      keys.push(key.name);
    }
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);

  return keys;
}

/**
 * Lists and parses all JSON values matching a KV prefix across all pagination cursors.
 */
export async function listAllValues<T>(
  kv: KVNamespace,
  prefix: string
): Promise<T[]> {
  const keys = await listAllKeys(kv, prefix);
  if (keys.length === 0) return [];

  const rawValues = await Promise.all(
    keys.map((key) => kv.get<T>(key, "json"))
  );
  const result: T[] = [];
  for (const val of rawValues) {
    if (val !== null) {
      result.push(val as T);
    }
  }
  return result;
}

function completionEntryKey(monthKey: string, c: TaskCompletion): string {
  return c.taskType === "DAILY"
    ? dailyCompletionKey(monthKey, c.occurrenceId)
    : maintenanceCompletionKey(monthKey, c.occurrenceId, c.completedBy);
}

/**
 * Loads the monthly completions map from a single KV key (`completions:month:YYYY-MM`)
 * using `kv.get()` (100k/day free tier) instead of `kv.list()` (1k/day free tier).
 * On first access for a month that has no monthly key yet, migrates any legacy
 * per-completion keys once and persists the monthly map.
 */
export async function getMonthCompletionsMap(
  kv: KVNamespace,
  monthKey: string
): Promise<Record<string, TaskCompletion>> {
  const monthKvKey = completionsMonthKey(monthKey);
  const existing = await kv.get<Record<string, TaskCompletion>>(monthKvKey, "json");
  if (existing !== null) {
    return existing;
  }

  const [daily, maintenance] = await Promise.all([
    listAllValues<TaskCompletion>(kv, completionDailyPrefix(monthKey)),
    listAllValues<TaskCompletion>(kv, completionMaintenancePrefix(monthKey)),
  ]);

  const migrated: Record<string, TaskCompletion> = {};
  for (const c of [...daily, ...maintenance]) {
    migrated[completionEntryKey(monthKey, c)] = c;
  }

  if (typeof kv.put === "function") {
    await kv.put(monthKvKey, JSON.stringify(migrated));
  }
  return migrated;
}

/**
 * Returns all completions for a given YYYY-MM month, optionally filtered by taskType.
 */
export async function getMonthCompletions(
  kv: KVNamespace,
  monthKey: string,
  taskType?: "DAILY" | "MAINTENANCE"
): Promise<TaskCompletion[]> {
  const map = await getMonthCompletionsMap(kv, monthKey);
  const all = Object.values(map);
  if (!taskType) return all;
  return all.filter((c) => c.taskType === taskType);
}

/**
 * Loads all task comments for a YYYY-MM month from a single KV key (`comments:month:YYYY-MM`).
 */
export async function getMonthComments(
  kv: KVNamespace,
  monthKey: string
): Promise<TaskComment[]> {
  const existing = await kv.get<TaskComment[]>(commentsMonthKey(monthKey), "json");
  return existing ?? [];
}
