import type { PagesFunction } from "@cloudflare/workers-types";
import type {
  CreateDailyTaskRequest,
  DailyTask,
  DailyTaskResponse,
  TaskSchedule,
  TasksListResponse,
  UpdateDailyTaskRequest,
} from "../../../src/shared/types";
import {
  errorResponse,
  isNonEmptyString,
  isValidIsoDate,
  isValidTargetShift,
  isValidTimeHHMM,
  jsonResponse,
  parseJsonBody,
} from "../_lib/http";
import { type Env, KV_KEYS } from "../_lib/kv";

export function validateSchedule(
  schedule: unknown,
  errors: string[]
): TaskSchedule | null {
  if (!schedule || typeof schedule !== "object") {
    errors.push("schedule must be an object");
    return null;
  }
  const s = schedule as Record<string, unknown>;
  if (s.type === "once") {
    if (!isValidIsoDate(s.date)) {
      errors.push("schedule.date must be a valid YYYY-MM-DD date");
      return null;
    }
    return { type: "once", date: s.date };
  }
  if (s.type === "daily") {
    return { type: "daily" };
  }
  if (s.type === "weekly") {
    if (!Array.isArray(s.daysOfWeek) || s.daysOfWeek.length === 0) {
      errors.push("schedule.daysOfWeek must be a non-empty array of integers 0..6");
      return null;
    }
    const validDays: number[] = [];
    for (const d of s.daysOfWeek) {
      if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6) {
        errors.push("schedule.daysOfWeek entries must be integers between 0 and 6");
        return null;
      }
      if (!validDays.includes(d)) {
        validDays.push(d);
      }
    }
    validDays.sort((a, b) => a - b);
    return { type: "weekly", daysOfWeek: validDays };
  }
  if (s.type === "interval") {
    if (
      typeof s.everyDays !== "number" ||
      !Number.isInteger(s.everyDays) ||
      s.everyDays < 1 ||
      s.everyDays > 365
    ) {
      errors.push("schedule.everyDays must be an integer between 1 and 365");
      return null;
    }
    if (!isValidIsoDate(s.startDate)) {
      errors.push("schedule.startDate must be a valid YYYY-MM-DD date");
      return null;
    }
    return { type: "interval", everyDays: s.everyDays, startDate: s.startDate };
  }

  errors.push("schedule.type must be 'once', 'daily', 'weekly', or 'interval'");
  return null;
}

export function validateTimes(times: unknown, errors: string[]): string[] | null {
  if (!Array.isArray(times) || times.length === 0) {
    errors.push("times must be a non-empty array of HH:MM strings");
    return null;
  }
  const unique = new Set<string>();
  for (const t of times) {
    if (!isValidTimeHHMM(t)) {
      errors.push(`Invalid time '${String(t)}'; expected HH:MM (24h)`);
      return null;
    }
    unique.add(t);
  }
  return Array.from(unique).sort();
}

export function validateCreateDailyTask(body: Record<string, unknown>): {
  errors: string[];
  data?: CreateDailyTaskRequest;
} {
  const errors: string[] = [];

  if (!isNonEmptyString(body.title)) {
    errors.push("title is required and must be a non-empty string");
  }
  if (body.description !== undefined && typeof body.description !== "string") {
    errors.push("description must be a string");
  }
  if (!isValidTargetShift(body.targetShift)) {
    errors.push("targetShift must be one of M, A, N, MID, ALL_ACTIVE");
  }
  const schedule = validateSchedule(body.schedule, errors);
  const times = validateTimes(body.times, errors);

  if (body.dueUntil !== undefined && !isValidTimeHHMM(body.dueUntil)) {
    errors.push("dueUntil must be a valid HH:MM (24h) string");
  }
  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    errors.push("enabled must be a boolean");
  }

  if (errors.length > 0 || !schedule || !times || !isValidTargetShift(body.targetShift)) {
    return { errors };
  }

  const trimmedDesc =
    typeof body.description === "string" && body.description.trim().length > 0
      ? body.description.trim()
      : undefined;

  return {
    errors: [],
    data: {
      title: (body.title as string).trim(),
      ...(trimmedDesc !== undefined ? { description: trimmedDesc } : {}),
      targetShift: body.targetShift,
      schedule,
      times,
      ...(typeof body.dueUntil === "string" ? { dueUntil: body.dueUntil } : {}),
      enabled: body.enabled !== undefined ? (body.enabled as boolean) : true,
    },
  };
}

export function validateUpdateDailyTask(body: Record<string, unknown>): {
  errors: string[];
  data?: UpdateDailyTaskRequest;
} {
  const errors: string[] = [];
  const data: UpdateDailyTaskRequest = {};

  if (body.title !== undefined) {
    if (!isNonEmptyString(body.title)) {
      errors.push("title must be a non-empty string");
    } else {
      data.title = body.title.trim();
    }
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string") {
      errors.push("description must be a string");
    } else {
      data.description = body.description.trim();
    }
  }
  if (body.targetShift !== undefined) {
    if (!isValidTargetShift(body.targetShift)) {
      errors.push("targetShift must be one of M, A, N, MID, ALL_ACTIVE");
    } else {
      data.targetShift = body.targetShift;
    }
  }
  if (body.schedule !== undefined) {
    const schedule = validateSchedule(body.schedule, errors);
    if (schedule) {
      data.schedule = schedule;
    }
  }
  if (body.times !== undefined) {
    const times = validateTimes(body.times, errors);
    if (times) {
      data.times = times;
    }
  }
  if (body.dueUntil !== undefined) {
    if (body.dueUntil === null || body.dueUntil === "") {
      data.dueUntil = null;
    } else if (!isValidTimeHHMM(body.dueUntil)) {
      errors.push("dueUntil must be a valid HH:MM (24h) string or null");
    } else {
      data.dueUntil = body.dueUntil;
    }
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      errors.push("enabled must be a boolean");
    } else {
      data.enabled = body.enabled;
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  return { errors: [], data };
}

export async function readDailyTasks(kv: Env["EGMT_ACTIVIT"]): Promise<DailyTask[]> {
  const stored = await kv.get<DailyTask[]>(KV_KEYS.dailyTasks, "json");
  return Array.isArray(stored) ? stored : [];
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const tasks = await readDailyTasks(context.env.EGMT_ACTIVIT);
  const response: TasksListResponse = { tasks };
  return jsonResponse(response, 200);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const parsed = await parseJsonBody<Record<string, unknown>>(context.request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const validation = validateCreateDailyTask(parsed.data);
  if (validation.errors.length > 0 || !validation.data) {
    return errorResponse("Validation failed", 400, validation.errors);
  }

  const nowIso = new Date().toISOString();
  const newTask: DailyTask = {
    id: crypto.randomUUID(),
    title: validation.data.title,
    ...(validation.data.description !== undefined
      ? { description: validation.data.description }
      : {}),
    targetShift: validation.data.targetShift,
    schedule: validation.data.schedule,
    times: validation.data.times,
    ...(validation.data.dueUntil !== undefined
      ? { dueUntil: validation.data.dueUntil }
      : {}),
    enabled: validation.data.enabled ?? true,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const tasks = await readDailyTasks(context.env.EGMT_ACTIVIT);
  tasks.push(newTask);
  await context.env.EGMT_ACTIVIT.put(KV_KEYS.dailyTasks, JSON.stringify(tasks));

  const response: DailyTaskResponse = { task: newTask };
  return jsonResponse(response, 201);
};
