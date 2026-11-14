import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  Loader2,
  Plus,
  Settings2,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import {
  createCompletion,
  createDailyTask,
  deleteDailyTask,
  fetchCompletions,
  fetchDailyTasks,
  fetchRoster,
  getErrorMessage,
  updateDailyTask,
} from "../api/client";
import {
  generateDailyOccurrences,
  groupDailyOccurrences,
} from "../domain/dailySchedule";
import {
  getBucharestNowParts,
  getNextCalendarDate,
  getPreviousCalendarDate,
} from "../shared/timezone";
import type {
  DailyOccurrence,
  DailyTask,
  RosterData,
  TargetShift,
  TaskCompletion,
  TaskSchedule,
} from "../shared/types";

interface DailyTasksViewProps {
  rosterCache: Record<string, RosterData | null>;
  onRosterLoaded: (monthKey: string, roster: RosterData | null) => void;
  onOpenRosterModal: () => void;
}

const TARGET_SHIFT_OPTIONS: Array<{ value: TargetShift; label: string }> = [
  { value: "M", label: "M — Morning (06:00–14:00)" },
  { value: "A", label: "A — Afternoon (14:00–22:00)" },
  { value: "N", label: "N — Night (22:00–06:00)" },
  { value: "MID", label: "MID — Midday (09:00–17:00)" },
  { value: "ALL_ACTIVE", label: "ALL ACTIVE — Any shift on duty" },
];

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

interface TaskFormModalProps {
  isOpen: boolean;
  editingTask: DailyTask | null;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}

function TaskFormModal({
  isOpen,
  editingTask,
  defaultDate,
  onClose,
  onSaved,
}: TaskFormModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetShift, setTargetShift] = useState<TargetShift>("M");
  const [scheduleType, setScheduleType] = useState<"daily" | "weekly" | "once">("daily");
  const [onceDate, setOnceDate] = useState(defaultDate);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [times, setTimes] = useState<string[]>(["08:00"]);
  const [newTime, setNewTime] = useState("12:00");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingTask) {
      setTitle(editingTask.title);
      setDescription(editingTask.description ?? "");
      setTargetShift(editingTask.targetShift);
      setScheduleType(editingTask.schedule.type);
      setOnceDate(
        editingTask.schedule.type === "once" ? editingTask.schedule.date : defaultDate
      );
      setDaysOfWeek(
        editingTask.schedule.type === "weekly"
          ? [...editingTask.schedule.daysOfWeek]
          : [1, 2, 3, 4, 5]
      );
      setTimes(editingTask.times.length > 0 ? [...editingTask.times] : ["08:00"]);
      setEnabled(editingTask.enabled);
    } else {
      setTitle("");
      setDescription("");
      setTargetShift("M");
      setScheduleType("daily");
      setOnceDate(defaultDate);
      setDaysOfWeek([1, 2, 3, 4, 5]);
      setTimes(["08:00"]);
      setEnabled(true);
    }
  }, [isOpen, editingTask, defaultDate]);

  if (!isOpen) return null;

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const addTime = () => {
    if (!/^\d{2}:\d{2}$/.test(newTime)) return;
    if (!times.includes(newTime)) {
      setTimes((prev) => [...prev, newTime].sort());
    }
  };

  const removeTime = (t: string) => {
    if (times.length <= 1) return;
    setTimes((prev) => prev.filter((item) => item !== t));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Task title is required.");
      return;
    }
    if (scheduleType === "weekly" && daysOfWeek.length === 0) {
      setError("Select at least one weekday for weekly schedule.");
      return;
    }
    if (scheduleType === "once" && !/^\d{4}-\d{2}-\d{2}$/.test(onceDate)) {
      setError("Valid date (YYYY-MM-DD) is required for one-time schedule.");
      return;
    }
    if (times.length === 0) {
      setError("At least one scheduled time (HH:MM) is required.");
      return;
    }

    let schedule: TaskSchedule;
    if (scheduleType === "daily") {
      schedule = { type: "daily" };
    } else if (scheduleType === "weekly") {
      schedule = { type: "weekly", daysOfWeek };
    } else {
      schedule = { type: "once", date: onceDate };
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        targetShift,
        schedule,
        times,
        enabled,
      };
      if (editingTask) {
        await updateDailyTask(editingTask.id, payload);
      } else {
        await createDailyTask(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingTask) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteDailyTask(editingTask.id);
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-100">
            {editingTask ? "Edit Daily Task" : "New Daily Task"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 p-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Check compressor oil pressure"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Description (optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Inspection criteria or safety notes..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Target Shift</label>
            <select
              value={targetShift}
              onChange={(e) => setTargetShift(e.target.value as TargetShift)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
            >
              {TARGET_SHIFT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Schedule</label>
            <div className="grid grid-cols-3 gap-2">
              {(["daily", "weekly", "once"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setScheduleType(type)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize transition ${
                    scheduleType === type
                      ? "border-amber-400 bg-amber-500/15 text-amber-300"
                      : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {scheduleType === "weekly" && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => {
                  const selected = daysOfWeek.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                        selected
                          ? "border-amber-400 bg-amber-500/20 text-amber-200"
                          : "border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            )}

            {scheduleType === "once" && (
              <div className="mt-2.5">
                <input
                  type="date"
                  value={onceDate}
                  onChange={(e) => setOnceDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                />
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Scheduled Times (24h, Europe/Bucharest)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {times.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 font-mono text-xs text-slate-200"
                >
                  {t}
                  {times.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTime(t)}
                      className="text-slate-400 hover:text-red-400"
                      aria-label={`Remove ${t}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={addTime}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Time
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-400"
            />
            <span>Task enabled</span>
          </label>

          <div className="flex items-center justify-between border-t border-slate-800 pt-4">
            {editingTask ? (
              <button
                type="button"
                disabled={deleting || saving}
                onClick={() => void handleDelete()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{deleting ? "Deleting..." : "Delete"}</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || deleting}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingTask ? "Save Changes" : "Create Task"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DailyTasksView({
  rosterCache,
  onRosterLoaded,
  onOpenRosterModal,
}: DailyTasksViewProps) {
  const [nowParts, setNowParts] = useState(() => getBucharestNowParts());
  const [selectedDate, setSelectedDate] = useState(() => getBucharestNowParts().date);

  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showDefinitions, setShowDefinitions] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DailyTask | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowParts(getBucharestNowParts());
    }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const currentMonthKey = selectedDate.slice(0, 7);
  const prevDate = useMemo(() => getPreviousCalendarDate(selectedDate), [selectedDate]);
  const prevMonthKey = prevDate.slice(0, 7);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasksRes, completionsRes] = await Promise.all([
        fetchDailyTasks(),
        fetchCompletions({ date: selectedDate }),
      ]);
      setTasks(tasksRes);
      setCompletions(completionsRes);

      if (!(currentMonthKey in rosterCache)) {
        const r = await fetchRoster(currentMonthKey);
        onRosterLoaded(currentMonthKey, r);
      }
      if (prevMonthKey !== currentMonthKey && !(prevMonthKey in rosterCache)) {
        const rPrev = await fetchRoster(prevMonthKey);
        onRosterLoaded(prevMonthKey, rPrev);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [selectedDate, currentMonthKey, prevMonthKey, rosterCache, onRosterLoaded]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const currentRoster = rosterCache[currentMonthKey] ?? null;
  const previousRoster =
    prevMonthKey === currentMonthKey ? currentRoster : (rosterCache[prevMonthKey] ?? null);

  const occurrences = useMemo(
    () =>
      generateDailyOccurrences({
        tasks,
        selectedDate,
        completions,
        currentRoster,
        previousRoster,
        nowDate: nowParts.date,
        nowTime: nowParts.time,
      }),
    [tasks, selectedDate, completions, currentRoster, previousRoster, nowParts.date, nowParts.time]
  );

  const grouped = useMemo(() => groupDailyOccurrences(occurrences), [occurrences]);

  const handleComplete = async (occ: DailyOccurrence, employee: string) => {
    const key = `${occ.occurrenceId}:${employee}`;
    setSubmittingKey(key);
    setActionError(null);
    try {
      await createCompletion({
        occurrenceId: occ.occurrenceId,
        taskId: occ.taskId,
        taskType: "DAILY",
        taskTitle: occ.taskTitle,
        scheduledDate: occ.scheduledDate,
        scheduledTime: occ.scheduledTime,
        completedBy: employee,
      });
      const updated = await fetchCompletions({ date: selectedDate });
      setCompletions(updated);
    } catch (err) {
      setActionError(getErrorMessage(err));
      // Refresh completions in case another operator completed it concurrently (409)
      try {
        const updated = await fetchCompletions({ date: selectedDate });
        setCompletions(updated);
      } catch {
        // ignore secondary error
      }
    } finally {
      setSubmittingKey(null);
    }
  };

  const renderGroup = (
    title: string,
    items: DailyOccurrence[],
    tone: "red" | "amber" | "slate" | "emerald",
    icon: typeof AlertTriangle
  ) => {
    const Icon = icon;
    const headerColors = {
      red: "border-red-500/40 bg-red-500/10 text-red-300",
      amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
      slate: "border-slate-700 bg-slate-900/90 text-slate-200",
      emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    }[tone];

    return (
      <section className="space-y-2.5">
        <div
          className={`flex items-center justify-between rounded-lg border px-3.5 py-2 text-xs font-semibold uppercase tracking-wider ${headerColors}`}
        >
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            <span>{title}</span>
          </div>
          <span className="font-mono">{items.length}</span>
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-4 text-xs text-slate-500">
            No {title.toLowerCase()} tasks for {selectedDate}.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {items.map((occ) => {
              const isCompleted = occ.status === "completed" && occ.completion !== null;
              return (
                <div
                  key={occ.occurrenceId}
                  className={`rounded-xl border p-4 transition ${
                    isCompleted
                      ? "border-emerald-500/30 bg-emerald-950/20"
                      : occ.status === "overdue"
                        ? "border-red-500/30 bg-slate-900/80"
                        : "border-slate-800 bg-slate-900/80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-amber-300">
                          {occ.scheduledTime}
                        </span>
                        <span className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-xs font-medium text-slate-300">
                          Shift {occ.targetShift}
                        </span>
                      </div>
                      <h3 className="mt-2 text-sm font-semibold text-slate-100">
                        {occ.taskTitle}
                      </h3>
                      {occ.taskDescription && (
                        <p className="mt-1 text-xs text-slate-400">{occ.taskDescription}</p>
                      )}
                    </div>

                    {isCompleted && occ.completion && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Done
                      </span>
                    )}
                  </div>

                  {isCompleted && occ.completion ? (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <UserCheck className="h-3.5 w-3.5" />
                        {occ.completion.completedBy}
                      </span>
                      <span className="font-mono text-emerald-300/80">
                        {occ.completion.completedAt.slice(11, 16)} UTC
                      </span>
                    </div>
                  ) : (
                    <div className="mt-3 border-t border-slate-800 pt-3">
                      {occ.eligibleEmployees.length === 0 ? (
                        <div className="text-xs text-slate-400">
                          {currentRoster
                            ? "No employees scheduled on this shift at this time."
                            : "No roster loaded for this month."}{" "}
                          {!currentRoster && (
                            <button
                              type="button"
                              onClick={onOpenRosterModal}
                              className="font-medium text-amber-400 underline hover:text-amber-300"
                            >
                              Upload Roster
                            </button>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                            Tap employee to mark completed (ANY 1 required)
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {occ.eligibleEmployees.map((emp) => {
                              const key = `${occ.occurrenceId}:${emp}`;
                              const busy = submittingKey === key;
                              return (
                                <button
                                  key={emp}
                                  type="button"
                                  disabled={submittingKey !== null}
                                  onClick={() => void handleComplete(occ, emp)}
                                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 transition hover:border-emerald-500/50 hover:bg-emerald-500/15 hover:text-emerald-200 active:scale-[0.98] disabled:opacity-50"
                                >
                                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                  <span>{emp}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedDate(getPreviousCalendarDate(selectedDate))}
            className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-slate-300 hover:bg-slate-800"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-amber-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) setSelectedDate(e.target.value);
              }}
              className="min-h-[38px] rounded-lg border border-slate-700 bg-slate-950 py-1.5 pl-9 pr-3 font-mono text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setSelectedDate(getNextCalendarDate(selectedDate))}
            className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-slate-300 hover:bg-slate-800"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {selectedDate !== nowParts.date && (
            <button
              type="button"
              onClick={() => setSelectedDate(nowParts.date)}
              className="min-h-[38px] rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 text-xs font-medium text-amber-300 hover:bg-amber-500/20"
            >
              Today ({nowParts.date})
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDefinitions((prev) => !prev)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span>Manage Tasks ({tasks.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingTask(null);
              setModalOpen(true);
            }}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-400"
          >
            <Plus className="h-4 w-4" />
            <span>New Daily Task</span>
          </button>
        </div>
      </div>

      {/* Task Definitions Management Drawer */}
      {showDefinitions && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">Configured Daily Tasks</h2>
            <button
              type="button"
              onClick={() => setShowDefinitions(false)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Close
            </button>
          </div>
          {tasks.length === 0 ? (
            <p className="text-xs text-slate-400">
              No daily tasks configured yet. Create one to start tracking.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-100">
                        {task.title}
                      </span>
                      {!task.enabled && (
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                          Disabled
                        </span>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-xs text-slate-400">
                      Shift {task.targetShift} · {task.schedule.type} · {task.times.join(", ")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTask(task);
                      setModalOpen(true);
                    }}
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-amber-300"
                    aria-label={`Edit ${task.title}`}
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {actionError && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3.5 text-xs text-red-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-300 hover:text-red-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50 py-14 text-sm text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-amber-400" />
          Loading daily schedule...
        </div>
      ) : (
        <div className="space-y-6">
          {renderGroup("Overdue", grouped.overdue, "red", AlertTriangle)}
          {renderGroup("Due Now", grouped.dueNow, "amber", Clock)}
          {renderGroup("Upcoming", grouped.upcoming, "slate", Calendar)}
          {renderGroup("Completed", grouped.completed, "emerald", CheckCircle2)}
        </div>
      )}

      <TaskFormModal
        isOpen={modalOpen}
        editingTask={editingTask}
        defaultDate={selectedDate}
        onClose={() => setModalOpen(false)}
        onSaved={() => void loadData()}
      />
    </div>
  );
}
