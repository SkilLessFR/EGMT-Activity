import type { PagesFunction } from "@cloudflare/workers-types";
import { getBucharestDate } from "../../../src/shared/timezone";
import type {
  CompletionsListResponse,
  CreateCompletionRequest,
  CreateCompletionResponse,
  TaskCompletion,
  TaskType,
} from "../../../src/shared/types";
import {
  errorResponse,
  isNonEmptyString,
  isValidIsoDate,
  isValidMaintenanceWindow,
  isValidMonthKey,
  isValidTimeHHMM,
  jsonResponse,
  parseJsonBody,
} from "../_lib/http";
import {
  bumpSyncVersion,
  completionsMonthKey,
  dailyCompletionKey,
  type Env,
  getMonthCompletions,
  getMonthCompletionsMap,
  maintenanceCompletionKey,
} from "../_lib/kv";

function isValidTaskType(val: unknown): val is TaskType {
  return val === "DAILY" || val === "MAINTENANCE";
}

function validateCreateCompletion(body: Record<string, unknown>): {
  errors: string[];
  data?: CreateCompletionRequest;
} {
  const errors: string[] = [];

  if (!isNonEmptyString(body.occurrenceId)) {
    errors.push("occurrenceId is required and must be a non-empty string");
  }
  if (!isNonEmptyString(body.taskId)) {
    errors.push("taskId is required and must be a non-empty string");
  }
  if (!isValidTaskType(body.taskType)) {
    errors.push("taskType must be 'DAILY' or 'MAINTENANCE'");
  }
  if (!isNonEmptyString(body.taskTitle)) {
    errors.push("taskTitle is required and must be a non-empty string");
  }
  if (!isValidIsoDate(body.scheduledDate)) {
    errors.push("scheduledDate must be a valid YYYY-MM-DD date");
  }
  if (!isNonEmptyString(body.completedBy)) {
    errors.push("completedBy is required and must be a non-empty string");
  }

  if (body.taskType === "DAILY") {
    if (!isValidTimeHHMM(body.scheduledTime)) {
      errors.push("scheduledTime is required for DAILY completions (HH:MM)");
    }
  } else if (body.taskType === "MAINTENANCE") {
    if (!isValidMaintenanceWindow(body.window)) {
      errors.push(
        "window is required for MAINTENANCE completions ('MORNING' or 'NIGHT')"
      );
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors: [],
    data: {
      occurrenceId: (body.occurrenceId as string).trim(),
      taskId: (body.taskId as string).trim(),
      taskType: body.taskType as TaskType,
      taskTitle: (body.taskTitle as string).trim(),
      scheduledDate: body.scheduledDate as string,
      ...(body.taskType === "DAILY"
        ? { scheduledTime: body.scheduledTime as string }
        : { window: body.window as CreateCompletionRequest["window"] }),
      completedBy: (body.completedBy as string).trim(),
    },
  };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const dateParam = url.searchParams.get("date");
  const monthParam = url.searchParams.get("month");
  const taskTypeParam = url.searchParams.get("taskType");

  let monthKey: string;
  if (dateParam !== null) {
    if (!isValidIsoDate(dateParam)) {
      return errorResponse("Invalid date parameter; expected YYYY-MM-DD", 400);
    }
    monthKey = dateParam.slice(0, 7);
  } else if (monthParam !== null) {
    if (!isValidMonthKey(monthParam)) {
      return errorResponse("Invalid month parameter; expected YYYY-MM", 400);
    }
    monthKey = monthParam;
  } else {
    monthKey = getBucharestDate().slice(0, 7);
  }

  if (taskTypeParam !== null && !isValidTaskType(taskTypeParam)) {
    return errorResponse(
      "Invalid taskType parameter; expected DAILY or MAINTENANCE",
      400
    );
  }

  const kv = context.env.EGMT_ACTIVIT;
  let completions = await getMonthCompletions(
    kv,
    monthKey,
    taskTypeParam === "DAILY" || taskTypeParam === "MAINTENANCE"
      ? taskTypeParam
      : undefined
  );
  if (dateParam !== null) {
    completions = completions.filter((c) => c.scheduledDate === dateParam);
  }

  completions.sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  const response: CompletionsListResponse = { completions };
  return jsonResponse(response, 200);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const parsed = await parseJsonBody<Record<string, unknown>>(context.request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const validation = validateCreateCompletion(parsed.data);
  if (validation.errors.length > 0 || !validation.data) {
    return errorResponse("Validation failed", 400, validation.errors);
  }

  const req = validation.data;
  const monthKey = req.scheduledDate.slice(0, 7);
  const kv = context.env.EGMT_ACTIVIT;

  const kvKey =
    req.taskType === "DAILY"
      ? dailyCompletionKey(monthKey, req.occurrenceId)
      : maintenanceCompletionKey(monthKey, req.occurrenceId, req.completedBy);

  const monthMap = await getMonthCompletionsMap(kv, monthKey);
  if (monthMap[kvKey] !== undefined) {
    const message =
      req.taskType === "DAILY"
        ? "This daily task occurrence has already been completed"
        : "This employee has already completed this maintenance occurrence";
    return errorResponse(message, 409);
  }

  const completion: TaskCompletion = {
    id: crypto.randomUUID(),
    occurrenceId: req.occurrenceId,
    taskId: req.taskId,
    taskType: req.taskType,
    taskTitle: req.taskTitle,
    scheduledDate: req.scheduledDate,
    ...(req.taskType === "DAILY"
      ? { scheduledTime: req.scheduledTime }
      : { window: req.window }),
    completedBy: req.completedBy,
    completedAt: new Date().toISOString(),
  };

  monthMap[kvKey] = completion;
  await Promise.all([
    kv.put(completionsMonthKey(monthKey), JSON.stringify(monthMap)),
    bumpSyncVersion(kv),
  ]);

  const response: CreateCompletionResponse = { completion };
  return jsonResponse(response, 201);
};
