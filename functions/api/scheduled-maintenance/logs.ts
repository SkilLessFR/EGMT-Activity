import type { PagesFunction } from "@cloudflare/workers-types";
import { DEFAULT_ROULETTE_ITEMS } from "../../../src/domain/scheduledMaintenance";
import type {
  ScheduledMaintenanceItem,
  ScheduledMaintenanceLog,
} from "../../../src/shared/types";
import {
  errorResponse,
  isNonEmptyString,
  jsonResponse,
  parseJsonBody,
} from "../_lib/http";
import { type Env, KV_KEYS } from "../_lib/kv";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const parsed = await parseJsonBody<Record<string, unknown>>(context.request);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;
  const errors: string[] = [];

  if (!isNonEmptyString(body.itemId)) {
    errors.push("itemId is required");
  }
  if (!isNonEmptyString(body.changedBy)) {
    errors.push("changedBy is required");
  }
  if (
    body.changedAt !== undefined &&
    (typeof body.changedAt !== "string" || Number.isNaN(Date.parse(body.changedAt)))
  ) {
    errors.push("changedAt must be a valid ISO timestamp");
  }
  if (body.notes !== undefined && typeof body.notes !== "string") {
    errors.push("notes must be a string");
  }

  if (errors.length > 0) {
    return errorResponse("Validation failed", 400, errors);
  }

  const kv = context.env.EGMT_ACTIVIT;
  const [itemsRaw, logsRaw] = await Promise.all([
    kv.get<ScheduledMaintenanceItem[]>(KV_KEYS.scheduledItems, "json"),
    kv.get<ScheduledMaintenanceLog[]>(KV_KEYS.scheduledLogs, "json"),
  ]);

  const items = itemsRaw ?? DEFAULT_ROULETTE_ITEMS;
  const item = items.find((i) => i.id === (body.itemId as string).trim());
  if (!item) {
    return errorResponse("Scheduled maintenance item not found", 404);
  }

  const now = new Date().toISOString();
  const changedAt =
    typeof body.changedAt === "string" ? new Date(body.changedAt).toISOString() : now;
  const trimmedNotes =
    typeof body.notes === "string" && body.notes.trim().length > 0
      ? body.notes.trim()
      : undefined;

  const log: ScheduledMaintenanceLog = {
    id: crypto.randomUUID(),
    itemId: item.id,
    itemName: item.name,
    location: item.location,
    changedAt,
    changedBy: (body.changedBy as string).trim(),
    ...(trimmedNotes !== undefined ? { notes: trimmedNotes } : {}),
    createdAt: now,
  };

  const existingLogs = logsRaw ?? [];
  const nextLogs = [log, ...existingLogs].sort((a, b) =>
    b.changedAt.localeCompare(a.changedAt)
  );
  await kv.put(KV_KEYS.scheduledLogs, JSON.stringify(nextLogs));

  return jsonResponse({ log }, 201);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const id = url.searchParams.get("id");
  if (!isNonEmptyString(id)) {
    return errorResponse("id query parameter is required", 400);
  }

  const kv = context.env.EGMT_ACTIVIT;
  const logsRaw = await kv.get<ScheduledMaintenanceLog[]>(
    KV_KEYS.scheduledLogs,
    "json"
  );
  const existing = logsRaw ?? [];
  const next = existing.filter((l) => l.id !== id.trim());
  if (next.length === existing.length) {
    return errorResponse("Scheduled maintenance log not found", 404);
  }

  await kv.put(KV_KEYS.scheduledLogs, JSON.stringify(next));
  return jsonResponse({ deleted: true, id: id.trim() }, 200);
};
