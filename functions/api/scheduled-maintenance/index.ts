import type { PagesFunction } from "@cloudflare/workers-types";
import { DEFAULT_ROULETTE_ITEMS } from "../../../src/domain/scheduledMaintenance";
import type {
  CreateScheduledItemRequest,
  ScheduledMaintenanceItem,
  ScheduledMaintenanceListResponse,
  ScheduledMaintenanceLog,
} from "../../../src/shared/types";
import {
  errorResponse,
  isNonEmptyString,
  jsonResponse,
  parseJsonBody,
} from "../_lib/http";
import { type Env, KV_KEYS } from "../_lib/kv";

async function loadItems(kv: KVNamespace): Promise<ScheduledMaintenanceItem[]> {
  const existing = await kv.get<ScheduledMaintenanceItem[]>(KV_KEYS.scheduledItems, "json");
  if (existing !== null) {
    return existing;
  }
  await kv.put(KV_KEYS.scheduledItems, JSON.stringify(DEFAULT_ROULETTE_ITEMS));
  return DEFAULT_ROULETTE_ITEMS;
}

async function loadLogs(kv: KVNamespace): Promise<ScheduledMaintenanceLog[]> {
  const existing = await kv.get<ScheduledMaintenanceLog[]>(KV_KEYS.scheduledLogs, "json");
  return existing ?? [];
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const kv = context.env.EGMT_ACTIVIT;
  const [items, logs] = await Promise.all([loadItems(kv), loadLogs(kv)]);
  const response: ScheduledMaintenanceListResponse = { items, logs };
  return jsonResponse(response, 200);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const parsed = await parseJsonBody<Record<string, unknown>>(context.request);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;
  const errors: string[] = [];

  if (!isNonEmptyString(body.name)) {
    errors.push("name is required");
  }
  if (!isNonEmptyString(body.category)) {
    errors.push("category is required");
  }
  if (!isNonEmptyString(body.location)) {
    errors.push("location is required");
  }
  if (
    typeof body.cycleDays !== "number" ||
    !Number.isInteger(body.cycleDays) ||
    body.cycleDays < 1 ||
    body.cycleDays > 365
  ) {
    errors.push("cycleDays must be an integer between 1 and 365");
  }
  if (
    typeof body.warningDays !== "number" ||
    !Number.isInteger(body.warningDays) ||
    body.warningDays < 0 ||
    body.warningDays > 30
  ) {
    errors.push("warningDays must be an integer between 0 and 30");
  }

  if (errors.length > 0) {
    return errorResponse("Validation failed", 400, errors);
  }

  const req = body as unknown as CreateScheduledItemRequest;
  const kv = context.env.EGMT_ACTIVIT;
  const items = await loadItems(kv);
  const now = new Date().toISOString();

  const item: ScheduledMaintenanceItem = {
    id: crypto.randomUUID(),
    name: req.name.trim(),
    category: req.category.trim(),
    location: req.location.trim(),
    cycleDays: req.cycleDays,
    warningDays: req.warningDays,
    inUse: typeof req.inUse === "boolean" ? req.inUse : true,
    createdAt: now,
    updatedAt: now,
  };

  await kv.put(KV_KEYS.scheduledItems, JSON.stringify([...items, item]));
  return jsonResponse({ item }, 201);
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const parsed = await parseJsonBody<Record<string, unknown>>(context.request);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;
  if (!isNonEmptyString(body.id)) {
    return errorResponse("id is required", 400);
  }

  const kv = context.env.EGMT_ACTIVIT;
  const items = await loadItems(kv);
  const index = items.findIndex((i) => i.id === body.id);
  if (index === -1) {
    return errorResponse("Scheduled maintenance item not found", 404);
  }

  const current = items[index];
  const updated: ScheduledMaintenanceItem = {
    ...current,
    ...(isNonEmptyString(body.name) ? { name: body.name.trim() } : {}),
    ...(isNonEmptyString(body.category) ? { category: body.category.trim() } : {}),
    ...(isNonEmptyString(body.location) ? { location: body.location.trim() } : {}),
    ...(typeof body.cycleDays === "number" &&
    Number.isInteger(body.cycleDays) &&
    body.cycleDays >= 1 &&
    body.cycleDays <= 365
      ? { cycleDays: body.cycleDays }
      : {}),
    ...(typeof body.warningDays === "number" &&
    Number.isInteger(body.warningDays) &&
    body.warningDays >= 0 &&
    body.warningDays <= 30
      ? { warningDays: body.warningDays }
      : {}),
    ...(typeof body.inUse === "boolean" ? { inUse: body.inUse } : {}),
    updatedAt: new Date().toISOString(),
  };

  const next = [...items];
  next[index] = updated;
  await kv.put(KV_KEYS.scheduledItems, JSON.stringify(next));
  return jsonResponse({ item: updated }, 200);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");
  if (!isNonEmptyString(id)) {
    return errorResponse("id query parameter is required", 400);
  }

  const kv = context.env.EGMT_ACTIVIT;
  const items = await loadItems(kv);
  const next = items.filter((i) => i.id !== id);
  if (next.length === items.length) {
    return errorResponse("Scheduled maintenance item not found", 404);
  }

  await kv.put(KV_KEYS.scheduledItems, JSON.stringify(next));
  return jsonResponse({ deleted: true, id }, 200);
};
