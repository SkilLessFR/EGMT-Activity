export type Shift = "M" | "A" | "N" | "MID";
export type TargetShift = Shift | "ALL_ACTIVE";
export type RosterShift = Shift | "OFF";

export type TaskSchedule =
  | { type: "once"; date: string } // YYYY-MM-DD
  | { type: "daily" }
  | { type: "weekly"; daysOfWeek: number[] } // 0 = Sun .. 6 = Sat
  | { type: "interval"; everyDays: number; startDate: string }; // every N days from YYYY-MM-DD

export interface DailyTask {
  id: string;
  title: string;
  description?: string;
  targetShift: TargetShift;
  schedule: TaskSchedule;
  times: string[]; // HH:MM (24h)
  dueUntil?: string; // HH:MM (24h) — when set, task is due from shift start until this deadline
  enabled: boolean;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export type MaintenanceWindow = "MORNING" | "NIGHT";

export interface MaintenanceTask {
  id: string;
  title: string;
  description?: string;
  window: MaintenanceWindow;
  enabled: boolean;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export type TaskType = "DAILY" | "MAINTENANCE";

export interface TaskCompletion {
  id: string;
  occurrenceId: string;
  taskId: string;
  taskType: TaskType;
  taskTitle: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime?: string; // HH:MM for DAILY
  window?: MaintenanceWindow; // MORNING | NIGHT for MAINTENANCE
  completedBy: string; // employee name
  completedAt: string; // ISO timestamp
}

export type DailyOccurrenceStatus =
  | "overdue"
  | "dueNow"
  | "upcoming"
  | "completed";

export interface DailyOccurrence {
  occurrenceId: string;
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
  targetShift: TargetShift;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:MM
  dueUntil?: string; // HH:MM
  eligibleEmployees: string[];
  status: DailyOccurrenceStatus;
  completion: TaskCompletion | null;
}

export interface MaintenanceOccurrence {
  occurrenceId: string;
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
  window: MaintenanceWindow;
  scheduledDate: string; // YYYY-MM-DD
  eligibleEmployees: string[];
  completions: TaskCompletion[];
  completionCount: number;
  status: "completed" | "pending";
}

export interface RosterDateColumn {
  index: number;
  date: string;
  isoDate: string; // YYYY-MM-DD
}

export interface RosterData {
  fileName: string;
  month: number; // 0-based JS month (0 = Jan, 10 = Nov)
  year: number;
  employees: string[];
  dateColumns: RosterDateColumn[];
  rows: Record<string, Record<string, RosterShift>>;
}

export type HistoryCategory = "ALL" | "DAILY" | "MAINTENANCE";

export interface HistoryItem {
  id: string;
  occurrenceId: string;
  taskId: string;
  taskType: TaskType;
  taskTitle: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime?: string; // HH:MM
  window?: MaintenanceWindow;
  completedBy: string | null;
  completedAt: string | null; // ISO timestamp
  status: "Completed" | "Pending";
}

// --- API Request / Response DTOs ---

export interface ApiErrorResponse {
  error: string;
  details?: string[];
}

export interface TasksListResponse {
  tasks: DailyTask[];
}

export interface CreateDailyTaskRequest {
  title: string;
  description?: string;
  targetShift: TargetShift;
  schedule: TaskSchedule;
  times: string[];
  dueUntil?: string;
  enabled?: boolean;
}

export type UpdateDailyTaskRequest = Partial<Omit<CreateDailyTaskRequest, "dueUntil">> & {
  dueUntil?: string | null;
};

export interface DailyTaskResponse {
  task: DailyTask;
}

export interface MaintenanceListResponse {
  tasks: MaintenanceTask[];
}

export interface CreateMaintenanceTaskRequest {
  title: string;
  description?: string;
  window: MaintenanceWindow;
  enabled?: boolean;
}

export type UpdateMaintenanceTaskRequest = Partial<CreateMaintenanceTaskRequest>;

export interface MaintenanceTaskResponse {
  task: MaintenanceTask;
}

export interface CompletionsListResponse {
  completions: TaskCompletion[];
}

export interface CreateCompletionRequest {
  occurrenceId: string;
  taskId: string;
  taskType: TaskType;
  taskTitle: string;
  scheduledDate: string;
  scheduledTime?: string;
  window?: MaintenanceWindow;
  completedBy: string;
}

export interface CreateCompletionResponse {
  completion: TaskCompletion;
}

export interface RosterUploadResponse {
  monthKey: string;
  roster: RosterData;
  summary: {
    monthKey: string;
    employeeCount: number;
    dateCount: number;
  };
}

export interface RosterGetResponse {
  monthKey: string;
  roster: RosterData;
}

export interface HistoryListResponse {
  items: HistoryItem[];
}

export interface DeleteResponse {
  deleted: true;
  id: string;
}
