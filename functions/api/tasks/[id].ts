import type { PagesFunction } from "@cloudflare/workers-types";
import type {
  DailyTask,
  DailyTaskResponse,
  DeleteResponse,
} from "../../../src/shared/types";
import { errorResponse, jsonResponse, parseJsonBody } from "../_lib/http";
import { type Env, KV_KEYS } from "../_lib/kv";
import { readDailyTasks, validateUpdateDailyTask } from "./index";

function extractId(raw: string | string[] | undefined): string | null {
  const id = Array.isArray(raw) ? raw[0] : raw;
  return id && id.trim().length > 0 ? id.trim() : null;
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const id = extractId(context.params.id);
  if (!id) {
    return errorResponse("Task ID is required", 400);
  }

  const parsed = await parseJsonBody<Record<string, unknown>>(context.request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const validation = validateUpdateDailyTask(parsed.data);
  if (validation.errors.length > 0 || !validation.data) {
    return errorResponse("Validation failed", 400, validation.errors);
  }

  const tasks = await readDailyTasks(context.env.EGMT_ACTIVIT);
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) {
    return errorResponse(`Daily task '${id}' not found`, 404);
  }

  const existing = tasks[idx];
  const updates = validation.data;

  const updated: DailyTask = {
    ...existing,
    ...(updates.title !== undefined ? { title: updates.title } : {}),
    ...(updates.description !== undefined
      ? updates.description.length > 0
        ? { description: updates.description }
        : { description: undefined }
      : {}),
    ...(updates.category === null
      ? { category: undefined }
      : updates.category !== undefined
        ? updates.category.length > 0
          ? { category: updates.category }
          : { category: undefined }
        : {}),
    ...(updates.targetShift !== undefined
      ? { targetShift: updates.targetShift }
      : {}),
    ...(updates.schedule !== undefined ? { schedule: updates.schedule } : {}),
    ...(updates.times !== undefined ? { times: updates.times } : {}),
    ...(updates.dueUntil === null
      ? { dueUntil: undefined }
      : updates.dueUntil !== undefined
        ? { dueUntil: updates.dueUntil }
        : {}),
    ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
    updatedAt: new Date().toISOString(),
  };

  tasks[idx] = updated;
  await context.env.EGMT_ACTIVIT.put(KV_KEYS.dailyTasks, JSON.stringify(tasks));

  const response: DailyTaskResponse = { task: updated };
  return jsonResponse(response, 200);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const id = extractId(context.params.id);
  if (!id) {
    return errorResponse("Task ID is required", 400);
  }

  const tasks = await readDailyTasks(context.env.EGMT_ACTIVIT);
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) {
    return errorResponse(`Daily task '${id}' not found`, 404);
  }

  tasks.splice(idx, 1);
  await context.env.EGMT_ACTIVIT.put(KV_KEYS.dailyTasks, JSON.stringify(tasks));

  const response: DeleteResponse = { deleted: true, id };
  return jsonResponse(response, 200);
};
