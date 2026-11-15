import type {
  ApiErrorResponse,
  CommentsListResponse,
  CompletionsListResponse,
  CreateCommentRequest,
  CreateCommentResponse,
  CreateCompletionRequest,
  CreateCompletionResponse,
  CreateDailyTaskRequest,
  CreateMaintenanceTaskRequest,
  CreateScheduledItemRequest,
  CreateScheduledLogRequest,
  DailyTask,
  DailyTaskResponse,
  DeleteResponse,
  DowntimeMonthSchedule,
  DowntimeScheduleResponse,
  HistoryCategory,
  HistoryItem,
  HistoryListResponse,
  MaintenanceListResponse,
  MaintenanceTask,
  MaintenanceTaskResponse,
  RosterData,
  RosterGetResponse,
  RosterUploadResponse,
  ScheduledMaintenanceItem,
  ScheduledMaintenanceListResponse,
  ScheduledMaintenanceLog,
  TaskComment,
  TaskCompletion,
  TasksListResponse,
  UpdateDailyTaskRequest,
  UpdateDowntimePhaseTeamRequest,
  UpdateDowntimeTaskRequest,
  UpdateMaintenanceTaskRequest,
} from "../shared/types";

export class ApiError extends Error {
  readonly status: number;
  readonly details?: string[];

  constructor(message: string, status: number, details?: string[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    throw new ApiError(
      err instanceof Error ? `Network error: ${err.message}` : "Network error while contacting server",
      0
    );
  }

  let body: unknown = null;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const errBody = body as Partial<ApiErrorResponse> | null;
    const message =
      errBody && typeof errBody.error === "string"
        ? errBody.error
        : `Request failed with status ${response.status}`;
    const details = Array.isArray(errBody?.details) ? errBody.details : undefined;
    throw new ApiError(message, response.status, details);
  }

  return body as T;
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.details && err.details.length > 0) {
      return `${err.message}: ${err.details.join("; ")}`;
    }
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "An unexpected error occurred";
}

// --- Daily Tasks ---

export async function fetchDailyTasks(): Promise<DailyTask[]> {
  const res = await requestJson<TasksListResponse>("/api/tasks");
  return res.tasks;
}

export async function createDailyTask(payload: CreateDailyTaskRequest): Promise<DailyTask> {
  const res = await requestJson<DailyTaskResponse>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.task;
}

export async function updateDailyTask(
  id: string,
  payload: UpdateDailyTaskRequest
): Promise<DailyTask> {
  const res = await requestJson<DailyTaskResponse>(`/api/tasks/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return res.task;
}

export async function deleteDailyTask(id: string): Promise<DeleteResponse> {
  return requestJson<DeleteResponse>(`/api/tasks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// --- Maintenance Tasks ---

export async function fetchMaintenanceTasks(): Promise<MaintenanceTask[]> {
  const res = await requestJson<MaintenanceListResponse>("/api/maintenance");
  return res.tasks;
}

export async function createMaintenanceTask(
  payload: CreateMaintenanceTaskRequest
): Promise<MaintenanceTask> {
  const res = await requestJson<MaintenanceTaskResponse>("/api/maintenance", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.task;
}

export async function updateMaintenanceTask(
  id: string,
  payload: UpdateMaintenanceTaskRequest
): Promise<MaintenanceTask> {
  const res = await requestJson<MaintenanceTaskResponse>(
    `/api/maintenance/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    }
  );
  return res.task;
}

export async function deleteMaintenanceTask(id: string): Promise<DeleteResponse> {
  return requestJson<DeleteResponse>(`/api/maintenance/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// --- Downtime Monthly Excel Schedule ---

export async function fetchDowntimeSchedule(
  month: string
): Promise<DowntimeMonthSchedule | null> {
  const res = await requestJson<DowntimeScheduleResponse>(
    `/api/downtime?month=${encodeURIComponent(month)}`
  );
  return res.schedule;
}

export async function saveDowntimeSchedule(
  schedule: DowntimeMonthSchedule
): Promise<DowntimeMonthSchedule> {
  const res = await requestJson<DowntimeScheduleResponse>("/api/downtime", {
    method: "POST",
    body: JSON.stringify({ schedule }),
  });
  if (!res.schedule) {
    throw new Error("Server returned empty schedule");
  }
  return res.schedule;
}

export async function updateDowntimeTask(
  payload: UpdateDowntimeTaskRequest
): Promise<DowntimeMonthSchedule> {
  const res = await requestJson<DowntimeScheduleResponse>("/api/downtime", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.schedule) {
    throw new Error("Server returned empty schedule");
  }
  return res.schedule;
}

export async function updateDowntimePhaseTeam(
  payload: UpdateDowntimePhaseTeamRequest
): Promise<DowntimeMonthSchedule> {
  const res = await requestJson<DowntimeScheduleResponse>("/api/downtime", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.schedule) {
    throw new Error("Server returned empty schedule");
  }
  return res.schedule;
}

export async function deleteDowntimeSchedule(
  month: string
): Promise<DeleteResponse> {
  return requestJson<DeleteResponse>(
    `/api/downtime?month=${encodeURIComponent(month)}`,
    { method: "DELETE" }
  );
}

// --- Completions ---

export async function fetchCompletions(params: {
  month?: string;
  date?: string;
}): Promise<TaskCompletion[]> {
  const search = new URLSearchParams();
  if (params.month) search.set("month", params.month);
  if (params.date) search.set("date", params.date);
  const res = await requestJson<CompletionsListResponse>(`/api/completions?${search.toString()}`);
  return res.completions;
}

export async function createCompletion(
  payload: CreateCompletionRequest
): Promise<TaskCompletion> {
  const res = await requestJson<CreateCompletionResponse>("/api/completions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.completion;
}

// --- Roster ---

export async function uploadRoster(roster: RosterData): Promise<RosterUploadResponse> {
  return requestJson<RosterUploadResponse>("/api/roster", {
    method: "POST",
    body: JSON.stringify(roster),
  });
}

export async function fetchRoster(monthKey: string): Promise<RosterData | null> {
  try {
    const res = await requestJson<RosterGetResponse>(
      `/api/roster/${encodeURIComponent(monthKey)}`
    );
    return res.roster;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

// --- History & Export ---

export interface HistoryQueryParams {
  from: string;
  to: string;
  employee?: string;
  task?: string;
  category?: HistoryCategory;
}

export async function fetchHistory(params: HistoryQueryParams): Promise<HistoryItem[]> {
  const search = new URLSearchParams();
  search.set("from", params.from);
  search.set("to", params.to);
  if (params.employee) search.set("employee", params.employee);
  if (params.task) search.set("task", params.task);
  if (params.category && params.category !== "ALL") search.set("category", params.category);
  const res = await requestJson<HistoryListResponse>(`/api/history?${search.toString()}`);
  return res.items;
}

export function getHistoryExportUrl(params: {
  type: "daily" | "downtime";
  from: string;
  to: string;
}): string {
  const search = new URLSearchParams({
    type: params.type,
    from: params.from,
    to: params.to,
  });
  return `/api/history/export?${search.toString()}`;
}

export async function downloadHistoryExport(params: {
  type: "daily" | "downtime";
  from: string;
  to: string;
}): Promise<void> {
  const url = getHistoryExportUrl(params);
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new ApiError(
      err instanceof Error ? `Network error: ${err.message}` : "Failed to download export",
      0
    );
  }

  if (!response.ok) {
    let message = `Export failed with status ${response.status}`;
    try {
      const errBody = (await response.json()) as Partial<ApiErrorResponse>;
      if (errBody && typeof errBody.error === "string") {
        message = errBody.error;
      }
    } catch {
      // ignore non-JSON error
    }
    throw new ApiError(message, response.status);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const fallbackName =
    params.type === "daily"
      ? `Daily_Tasks_${params.from}_to_${params.to}.xlsx`
      : `Downtimes_${params.from}_to_${params.to}.xlsx`;
  const fileName = match?.[1] ?? fallbackName;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function fetchComments(params: { date?: string; month?: string }): Promise<TaskComment[]> {
  const qs = new URLSearchParams();
  if (params.date) qs.set("date", params.date);
  if (params.month) qs.set("month", params.month);
  const query = qs.toString();
  const data = await requestJson<CommentsListResponse>(`/api/comments${query ? `?${query}` : ""}`);
  return data.comments;
}

export async function createComment(payload: CreateCommentRequest): Promise<TaskComment> {
  const data = await requestJson<CreateCommentResponse>("/api/comments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.comment;
}

export async function fetchScheduledMaintenance(): Promise<ScheduledMaintenanceListResponse> {
  return requestJson<ScheduledMaintenanceListResponse>("/api/scheduled-maintenance");
}

export async function createScheduledItem(
  payload: CreateScheduledItemRequest
): Promise<ScheduledMaintenanceItem> {
  const data = await requestJson<{ item: ScheduledMaintenanceItem }>(
    "/api/scheduled-maintenance",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  return data.item;
}

export async function updateScheduledItem(
  payload: Partial<CreateScheduledItemRequest> & { id: string }
): Promise<ScheduledMaintenanceItem> {
  const data = await requestJson<{ item: ScheduledMaintenanceItem }>(
    "/api/scheduled-maintenance",
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
  return data.item;
}

export async function deleteScheduledItem(id: string): Promise<void> {
  await requestJson<DeleteResponse>(
    `/api/scheduled-maintenance?id=${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}

export async function logScheduledMaintenanceChange(
  payload: CreateScheduledLogRequest
): Promise<ScheduledMaintenanceLog> {
  const data = await requestJson<{ log: ScheduledMaintenanceLog }>(
    "/api/scheduled-maintenance/logs",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  return data.log;
}
