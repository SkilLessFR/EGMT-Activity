import type { PagesFunction } from "@cloudflare/workers-types";
import { TASK_TEMPLATES } from "../../../src/domain/taskTemplates";
import { getBucharestDate } from "../../../src/shared/timezone";
import type {
  CreateTemplateLogRequest,
  TemplateLogEntry,
  TemplateLogPhoto,
  TemplateLogResponse,
} from "../../../src/shared/types";
import {
  errorResponse,
  isNonEmptyString,
  isValidMonthKey,
  jsonResponse,
  parseJsonBody,
} from "../_lib/http";
import {
  bumpSyncVersion,
  type Env,
  templateLogsMonthKey,
} from "../_lib/kv";

const TEMPLATES_BY_ID = new Map(TASK_TEMPLATES.map((t) => [t.id, t]));

async function loadMonthTemplateLogs(
  kv: Env["EGMT_ACTIVIT"],
  monthKey: string
): Promise<TemplateLogEntry[]> {
  const stored = await kv.get<TemplateLogEntry[]>(
    templateLogsMonthKey(monthKey),
    "json"
  );
  return Array.isArray(stored) ? stored : [];
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const month = url.searchParams.get("month") ?? getBucharestDate().slice(0, 7);
  if (!isValidMonthKey(month)) {
    return errorResponse("Invalid month parameter; expected YYYY-MM", 400);
  }
  const logs = await loadMonthTemplateLogs(context.env.EGMT_ACTIVIT, month);
  return jsonResponse({ logs }, 200);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const parsed = await parseJsonBody<CreateTemplateLogRequest>(context.request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const body = parsed.data as unknown as Record<string, unknown>;
  const errors: string[] = [];

  if (!isNonEmptyString(body.templateId)) {
    errors.push("templateId is required");
  }
  const template = isNonEmptyString(body.templateId)
    ? TEMPLATES_BY_ID.get((body.templateId as string).trim())
    : undefined;
  if (!template) {
    errors.push("Unknown templateId");
  }

  if (!isNonEmptyString(body.studio)) {
    errors.push("studio is required");
  }

  const people: string[] = [];
  if (!Array.isArray(body.completedBy) || body.completedBy.length === 0) {
    errors.push("At least one technician must be selected");
  } else {
    const seen = new Set<string>();
    for (const p of body.completedBy) {
      if (typeof p === "string" && p.trim()) {
        const trimmed = p.trim();
        const key = trimmed.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          people.push(trimmed);
        }
      }
    }
    if (people.length === 0) {
      errors.push("At least one valid technician name is required");
    }
  }

  const oldSn =
    typeof body.oldSerialNumber === "string" ? body.oldSerialNumber.trim() : "";
  const newSn =
    typeof body.newSerialNumber === "string" ? body.newSerialNumber.trim() : "";
  const comment =
    typeof body.comment === "string" ? body.comment.trim() : "";

  if (template?.requiresSerialNumbers) {
    if (!oldSn) errors.push("Old roulette SN is required");
    if (!newSn) errors.push("New roulette SN is required");
  }

  if (template?.requiresComment && !comment) {
    errors.push(`${template.commentLabel ?? "Commentary"} is required`);
  }

  const photos: TemplateLogPhoto[] = [];
  if (Array.isArray(body.photos)) {
    for (const item of body.photos) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as TemplateLogPhoto).label === "string" &&
        typeof (item as TemplateLogPhoto).dataUrl === "string" &&
        (item as TemplateLogPhoto).dataUrl.startsWith("data:image/")
      ) {
        photos.push({
          label: (item as TemplateLogPhoto).label.trim(),
          dataUrl: (item as TemplateLogPhoto).dataUrl,
        });
      }
    }
  }

  if (template?.requiredPhotos && template.requiredPhotos.length > 0) {
    if (photos.length < template.requiredPhotos.length) {
      errors.push(
        `Required photo(s) missing: ${template.requiredPhotos.map((p) => p.label).join(", ")}`
      );
    }
  }

  if (errors.length > 0 || !template) {
    return errorResponse("Validation failed", 400, errors);
  }

  const now = new Date();
  const loggedAt = now.toISOString();
  const loggedDate = getBucharestDate(now);
  const monthKey = loggedDate.slice(0, 7);

  const entry: TemplateLogEntry = {
    id: crypto.randomUUID(),
    templateId: template.id,
    category: template.category,
    optionName: template.name,
    studio: (body.studio as string).trim(),
    completedBy: people,
    ...(oldSn ? { oldSerialNumber: oldSn } : {}),
    ...(newSn ? { newSerialNumber: newSn } : {}),
    ...(comment ? { comment } : {}),
    ...(photos.length > 0 ? { photos } : {}),
    loggedDate,
    loggedAt,
  };

  const kv = context.env.EGMT_ACTIVIT;
  const existing = await loadMonthTemplateLogs(kv, monthKey);
  const next = [entry, ...existing];
  await Promise.all([
    kv.put(templateLogsMonthKey(monthKey), JSON.stringify(next)),
    bumpSyncVersion(kv),
  ]);

  const response: TemplateLogResponse = { log: entry };
  return jsonResponse(response, 201);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const month = url.searchParams.get("month");
  const id = url.searchParams.get("id");

  if (!isValidMonthKey(month)) {
    return errorResponse("Invalid month parameter; expected YYYY-MM", 400);
  }
  if (!isNonEmptyString(id)) {
    return errorResponse("id query parameter is required", 400);
  }

  const kv = context.env.EGMT_ACTIVIT;
  const existing = await loadMonthTemplateLogs(kv, month);
  const targetId = id.trim();
  const next = existing.filter((l) => l.id !== targetId);
  if (next.length === existing.length) {
    return errorResponse("Template log not found", 404);
  }

  await Promise.all([
    kv.put(templateLogsMonthKey(month), JSON.stringify(next)),
    bumpSyncVersion(kv),
  ]);

  return jsonResponse({ deleted: true, id: targetId }, 200);
};
