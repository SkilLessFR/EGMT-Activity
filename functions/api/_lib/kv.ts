import type { KVNamespace } from "@cloudflare/workers-types";

export interface Env {
  EGMT_ACTIVIT: KVNamespace;
}

export const KV_KEYS = {
  dailyTasks: "config:daily-tasks",
  maintenanceTasks: "config:maintenance-tasks",
} as const;

export function rosterKey(monthKey: string): string {
  return `roster:${monthKey}`;
}

export function normalizeEmployeeKey(employeeName: string): string {
  return encodeURIComponent(employeeName.trim().toLowerCase());
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
