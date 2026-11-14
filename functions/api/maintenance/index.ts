import type { PagesFunction } from "@cloudflare/workers-types";
import type {
  CreateMaintenanceTaskRequest,
  MaintenanceListResponse,
  MaintenanceTask,
  MaintenanceTaskResponse,
} from "../../../src/shared/types";
import {
  errorResponse,
  isNonEmptyString,
  isValidMaintenanceWindow,
  jsonResponse,
  parseJsonBody,
} from "../_lib/http";
import { type Env, KV_KEYS } from "../_lib/kv";

async function loadMaintenanceTasks(
  kv: Env["EGMT_ACTIVIT"]
): Promise<MaintenanceTask[]> {
  const stored = await kv.get<MaintenanceTask[]>(
    KV_KEYS.maintenanceTasks,
    "json"
  );
  return Array.isArray(stored) ? stored : [];
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const tasks = await loadMaintenanceTasks(context.env.EGMT_ACTIVIT);
  const response: MaintenanceListResponse = { tasks };
  return jsonResponse(response, 200);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const parsed = await parseJsonBody<CreateMaintenanceTaskRequest>(
    context.request
  );
  if (!parsed.ok) {
    return parsed.response;
  }

  const body = parsed.data as unknown as Record<string, unknown>;
  const errors: string[] = [];

  if (!isNonEmptyString(body.title)) {
    errors.push("title must be a non-empty string");
  }

  if (body.description !== undefined && typeof body.description !== "string") {
    errors.push("description must be a string if provided");
  }

  if (!isValidMaintenanceWindow(body.window)) {
    errors.push('window must be "MORNING" or "NIGHT"');
  }

  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    errors.push("enabled must be a boolean if provided");
  }

  if (errors.length > 0) {
    return errorResponse("Invalid maintenance task payload", 400, errors);
  }

  const now = new Date().toISOString();
  const trimmedDescription =
    typeof body.description === "string" ? body.description.trim() : "";

  const newTask: MaintenanceTask = {
    id: crypto.randomUUID(),
    title: (body.title as string).trim(),
    ...(trimmedDescription ? { description: trimmedDescription } : {}),
    window: body.window as MaintenanceTask["window"],
    enabled: body.enabled !== undefined ? (body.enabled as boolean) : true,
    createdAt: now,
    updatedAt: now,
  };

  const tasks = await loadMaintenanceTasks(context.env.EGMT_ACTIVIT);
  tasks.push(newTask);
  await context.env.EGMT_ACTIVIT.put(
    KV_KEYS.maintenanceTasks,
    JSON.stringify(tasks)
  );

  const response: MaintenanceTaskResponse = { task: newTask };
  return jsonResponse(response, 201);
};
