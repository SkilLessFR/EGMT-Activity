import type { PagesFunction } from "@cloudflare/workers-types";
import type {
  DeleteResponse,
  MaintenanceTask,
  MaintenanceTaskResponse,
  UpdateMaintenanceTaskRequest,
} from "../../../src/shared/types";
import {
  errorResponse,
  isNonEmptyString,
  isValidMaintenanceWindow,
  jsonResponse,
  parseJsonBody,
} from "../_lib/http";
import { type Env, KV_KEYS } from "../_lib/kv";

function extractId(rawId: string | string[] | undefined): string {
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  return typeof id === "string" ? id.trim() : "";
}

async function loadMaintenanceTasks(
  kv: Env["EGMT_ACTIVIT"]
): Promise<MaintenanceTask[]> {
  const stored = await kv.get<MaintenanceTask[]>(
    KV_KEYS.maintenanceTasks,
    "json"
  );
  return Array.isArray(stored) ? stored : [];
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const id = extractId(context.params.id);
  if (!isNonEmptyString(id)) {
    return errorResponse("Missing maintenance task id", 400);
  }

  const parsed = await parseJsonBody<UpdateMaintenanceTaskRequest>(
    context.request
  );
  if (!parsed.ok) {
    return parsed.response;
  }

  const body = parsed.data as unknown as Record<string, unknown>;
  const errors: string[] = [];

  if (body.title !== undefined && !isNonEmptyString(body.title)) {
    errors.push("title must be a non-empty string");
  }

  if (
    body.description !== undefined &&
    body.description !== null &&
    typeof body.description !== "string"
  ) {
    errors.push("description must be a string");
  }

  if (body.window !== undefined && !isValidMaintenanceWindow(body.window)) {
    errors.push('window must be "MORNING" or "NIGHT"');
  }

  if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
    errors.push("enabled must be a boolean");
  }

  if (errors.length > 0) {
    return errorResponse("Invalid maintenance task update payload", 400, errors);
  }

  const tasks = await loadMaintenanceTasks(context.env.EGMT_ACTIVIT);
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) {
    return errorResponse(`Maintenance task "${id}" not found`, 404);
  }

  const existing = tasks[index];
  const nextDescription =
    body.description === undefined
      ? existing.description
      : body.description === null
        ? undefined
        : (body.description as string).trim() || undefined;

  const updatedTask: MaintenanceTask = {
    ...existing,
    title:
      body.title !== undefined ? (body.title as string).trim() : existing.title,
    window:
      body.window !== undefined
        ? (body.window as MaintenanceTask["window"])
        : existing.window,
    enabled:
      body.enabled !== undefined
        ? (body.enabled as boolean)
        : existing.enabled,
    updatedAt: new Date().toISOString(),
  };

  if (nextDescription !== undefined) {
    updatedTask.description = nextDescription;
  } else {
    delete updatedTask.description;
  }

  tasks[index] = updatedTask;
  await context.env.EGMT_ACTIVIT.put(
    KV_KEYS.maintenanceTasks,
    JSON.stringify(tasks)
  );

  const response: MaintenanceTaskResponse = { task: updatedTask };
  return jsonResponse(response, 200);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const id = extractId(context.params.id);
  if (!isNonEmptyString(id)) {
    return errorResponse("Missing maintenance task id", 400);
  }

  const tasks = await loadMaintenanceTasks(context.env.EGMT_ACTIVIT);
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) {
    return errorResponse(`Maintenance task "${id}" not found`, 404);
  }

  tasks.splice(index, 1);
  await context.env.EGMT_ACTIVIT.put(
    KV_KEYS.maintenanceTasks,
    JSON.stringify(tasks)
  );

  const response: DeleteResponse = { deleted: true, id };
  return jsonResponse(response, 200);
};
