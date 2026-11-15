import { buildUnifiedHistory } from "../../../src/domain/history";
import {
  getBucharestDate,
  getMonthsInRange,
} from "../../../src/shared/timezone";
import type {
  HistoryCategory,
  HistoryListResponse,
  MaintenanceTask,
} from "../../../src/shared/types";
import { errorResponse, isValidIsoDate, jsonResponse } from "../_lib/http";
import {
  type Env,
  getMonthCompletions,
  KV_KEYS,
} from "../_lib/kv";

const VALID_CATEGORIES = new Set<HistoryCategory>([
  "ALL",
  "DAILY",
  "MAINTENANCE",
]);

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const today = getBucharestDate();

  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const employeeParam = url.searchParams.get("employee") ?? undefined;
  const taskParam = url.searchParams.get("task") ?? undefined;
  const categoryParam = (url.searchParams.get("category") ??
    "ALL") as HistoryCategory;

  const from = fromParam ?? `${today.slice(0, 7)}-01`;
  const to = toParam ?? today;

  if (!isValidIsoDate(from)) {
    return errorResponse("Invalid 'from' date. Expected YYYY-MM-DD.", 400);
  }
  if (!isValidIsoDate(to)) {
    return errorResponse("Invalid 'to' date. Expected YYYY-MM-DD.", 400);
  }
  if (from > to) {
    return errorResponse("'from' date must be on or before 'to' date.", 400);
  }
  if (!VALID_CATEGORIES.has(categoryParam)) {
    return errorResponse(
      "Invalid 'category'. Expected ALL, DAILY, or MAINTENANCE.",
      400
    );
  }

  const months = getMonthsInRange(from, to);
  const kv = context.env.EGMT_ACTIVIT;

  const includeDaily = categoryParam === "ALL" || categoryParam === "DAILY";
  const includeMaintenance =
    categoryParam === "ALL" || categoryParam === "MAINTENANCE";

  const [monthBatches, maintenanceTasks] = await Promise.all([
    Promise.all(months.map((m) => getMonthCompletions(kv, m))),
    includeMaintenance
      ? kv.get<MaintenanceTask[]>(KV_KEYS.maintenanceTasks, "json")
      : Promise.resolve(null),
  ]);

  const allCompletions = monthBatches.flat();
  const dailyCompletions = includeDaily
    ? allCompletions.filter((c) => c.taskType === "DAILY")
    : [];
  const maintenanceCompletions = includeMaintenance
    ? allCompletions.filter((c) => c.taskType === "MAINTENANCE")
    : [];

  const items = buildUnifiedHistory({
    dailyCompletions,
    maintenanceCompletions,
    maintenanceTasks: includeMaintenance ? (maintenanceTasks ?? []) : undefined,
    filters: {
      from,
      to,
      employee: employeeParam,
      task: taskParam,
      category: categoryParam,
      sortOrder: "desc",
    },
  });

  const response: HistoryListResponse = { items };
  return jsonResponse(response);
};
