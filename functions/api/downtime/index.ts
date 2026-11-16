import type { PagesFunction } from "@cloudflare/workers-types";
import type {
  DeleteResponse,
  DowntimeMonthSchedule,
  DowntimeScheduleResponse,
  SaveDowntimeScheduleRequest,
  UpdateDowntimePhaseTeamRequest,
  UpdateDowntimeTaskRequest,
} from "../../../src/shared/types";
import {
  errorResponse,
  isNonEmptyString,
  isValidMonthKey,
  jsonResponse,
  parseJsonBody,
} from "../_lib/http";
import { bumpSyncVersion, downtimeScheduleKey, type Env } from "../_lib/kv";

function normalizePeopleList(people: unknown): string[] | null {
  if (!Array.isArray(people)) return null;
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of people) {
    if (typeof item !== "string") return null;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const month = url.searchParams.get("month");

  if (!isValidMonthKey(month)) {
    return errorResponse("Invalid month parameter; expected YYYY-MM", 400);
  }

  const stored = await context.env.EGMT_ACTIVIT.get<DowntimeMonthSchedule>(
    downtimeScheduleKey(month),
    "json"
  );

  const response: DowntimeScheduleResponse = {
    schedule: stored ?? null,
  };
  return jsonResponse(response, 200);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const parsed = await parseJsonBody<SaveDowntimeScheduleRequest>(
    context.request
  );
  if (!parsed.ok) {
    return parsed.response;
  }

  const schedule = parsed.data?.schedule;
  if (!schedule || typeof schedule !== "object") {
    return errorResponse("schedule object is required", 400);
  }
  if (!isValidMonthKey(schedule.monthKey)) {
    return errorResponse("schedule.monthKey must be YYYY-MM", 400);
  }
  if (!Array.isArray(schedule.phases) || !Array.isArray(schedule.tasks)) {
    return errorResponse("schedule.phases and schedule.tasks must be arrays", 400);
  }

  const normalizedSchedule: DowntimeMonthSchedule = {
    ...schedule,
    uploadedAt: schedule.uploadedAt || new Date().toISOString(),
  };

  await Promise.all([
    context.env.EGMT_ACTIVIT.put(
      downtimeScheduleKey(normalizedSchedule.monthKey),
      JSON.stringify(normalizedSchedule)
    ),
    bumpSyncVersion(context.env.EGMT_ACTIVIT),
  ]);

  const response: DowntimeScheduleResponse = {
    schedule: normalizedSchedule,
  };
  return jsonResponse(response, 200);
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const parsed = await parseJsonBody<
    UpdateDowntimeTaskRequest | UpdateDowntimePhaseTeamRequest
  >(context.request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const body = parsed.data as unknown as Record<string, unknown>;
  if (!isValidMonthKey(body.monthKey)) {
    return errorResponse("monthKey must be YYYY-MM", 400);
  }

  const monthKey = body.monthKey as string;
  const key = downtimeScheduleKey(monthKey);
  const schedule = await context.env.EGMT_ACTIVIT.get<DowntimeMonthSchedule>(
    key,
    "json"
  );

  if (!schedule) {
    return errorResponse(
      `No downtime schedule uploaded for ${monthKey}`,
      404
    );
  }

  const now = new Date().toISOString();

  // Branch 1: Update phase default team
  if (typeof body.phaseNumber === "number") {
    const people = normalizePeopleList(body.defaultTeam);
    if (!people) {
      return errorResponse("defaultTeam must be an array of strings", 400);
    }

    const phaseIdx = schedule.phases.findIndex(
      (p) => p.phaseNumber === body.phaseNumber
    );
    if (phaseIdx === -1) {
      return errorResponse(`Phase ${body.phaseNumber} not found`, 404);
    }

    schedule.phases[phaseIdx] = {
      ...schedule.phases[phaseIdx],
      defaultTeam: people,
    };

    if (body.applyToAllTasks) {
      schedule.tasks = schedule.tasks.map((task) =>
        task.phaseNumber === body.phaseNumber
          ? { ...task, assignedPeople: [...people], updatedAt: now }
          : task
      );
    }

    await Promise.all([
      context.env.EGMT_ACTIVIT.put(key, JSON.stringify(schedule)),
      bumpSyncVersion(context.env.EGMT_ACTIVIT),
    ]);
    return jsonResponse({ schedule } satisfies DowntimeScheduleResponse, 200);
  }

  // Branch 2: Update individual task
  if (!isNonEmptyString(body.taskId)) {
    return errorResponse("taskId or phaseNumber is required", 400);
  }

  const taskIdx = schedule.tasks.findIndex((t) => t.id === body.taskId);
  if (taskIdx === -1) {
    return errorResponse(`Downtime task "${body.taskId}" not found`, 404);
  }

  const existing = schedule.tasks[taskIdx];
  const updated = { ...existing, updatedAt: now };

  if (body.assignedPeople !== undefined) {
    const people = normalizePeopleList(body.assignedPeople);
    if (!people) {
      return errorResponse("assignedPeople must be an array of strings", 400);
    }
    updated.assignedPeople = people;
  }

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return errorResponse("enabled must be a boolean", 400);
    }
    updated.enabled = body.enabled;
  }

  if (body.description !== undefined) {
    if (!isNonEmptyString(body.description)) {
      return errorResponse("description must be a non-empty string", 400);
    }
    updated.description = (body.description as string).trim();
  }

  schedule.tasks[taskIdx] = updated;
  await Promise.all([
    context.env.EGMT_ACTIVIT.put(key, JSON.stringify(schedule)),
    bumpSyncVersion(context.env.EGMT_ACTIVIT),
  ]);

  return jsonResponse({ schedule } satisfies DowntimeScheduleResponse, 200);
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const month = url.searchParams.get("month");

  if (!isValidMonthKey(month)) {
    return errorResponse("Invalid month parameter; expected YYYY-MM", 400);
  }

  await context.env.EGMT_ACTIVIT.delete(downtimeScheduleKey(month));
  const response: DeleteResponse = { deleted: true, id: month };
  return jsonResponse(response, 200);
};
