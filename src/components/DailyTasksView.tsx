import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Loader2,
  Plus,
  Settings2,
  Trash2,
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
  formatBucharestDateTime,
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
import { ConfirmDialog, Modal } from "./ui/Modal";
import {
  Button,
  EmptyState,
  SkeletonCard,
  StatusDot,
  inputClassName,
  selectClassName,
} from "./ui/Primitives";
import { useToast } from "./ui/Toast";

interface DailyTasksViewProps {
  rosterCache: Record<string, RosterData | null>;
  onRosterLoaded: (monthKey: string, roster: RosterData | null) => void;
  onOpenRosterModal: () => void;
}

const TARGET_SHIFT_OPTIONS: Array<{ value: TargetShift; label: string; short: string }> = [
  { value: "M", label: "Morning (M · 06:00–14:00)", short: "Shift M" },
  { value: "A", label: "Afternoon (A · 14:00–22:00)", short: "Shift A" },
  { value: "N", label: "Night (N · 22:00–06:00)", short: "Shift N" },
  { value: "MID", label: "Midday (MID · 09:00–17:00)", short: "Shift MID" },
  { value: "ALL_ACTIVE", label: "All Active Shifts (at scheduled time)", short: "All Active" },
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
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetShift, setTargetShift] = useState<TargetShift>("M");
  const [scheduleType, setScheduleType] = useState<"daily" | "weekly" | "once">("daily");
  const [onceDate, setOnceDate] = useState(defaultDate);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [times, setTimes] = useState<string[]>(["08:00"]);
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setConfirmDeleteOpen(false);
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

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const updateTimeAt = (index: number, value: string) => {
    setTimes((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const addTime = () => {
    const candidates = ["12:00", "16:00", "20:00", "00:00", "04:00", "08:00"];
    const next = candidates.find((c) => !times.includes(c)) ?? "12:00";
    setTimes((prev) => [...prev, next]);
  };

  const removeTimeAt = (index: number) => {
    if (times.length <= 1) return;
    setTimes((prev) => prev.filter((_, i) => i !== index));
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
    const cleanedTimes = Array.from(
      new Set(times.filter((t) => /^\d{2}:\d{2}$/.test(t)))
    ).sort();
    if (cleanedTimes.length === 0) {
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
        times: cleanedTimes,
        enabled,
      };
      if (editingTask) {
        await updateDailyTask(editingTask.id, payload);
        showToast({ tone: "success", title: "Task updated", description: payload.title });
      } else {
        await createDailyTask(payload);
        showToast({ tone: "success", title: "Task created", description: payload.title });
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
      showToast({ tone: "info", title: "Task deleted", description: editingTask.title });
      setConfirmDeleteOpen(false);
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setConfirmDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={editingTask ? "Edit Daily Task" : "New Daily Task"}
        subtitle="Configure shift eligibility, recurrence, and scheduled times"
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-300">
              Task Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Inspect bill validator sensors"
              className={inputClassName}
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-300">
              Description <span className="text-zinc-500">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Checklist notes or acceptance criteria..."
              className={inputClassName}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-300">
              Target Shift
            </label>
            <select
              value={targetShift}
              onChange={(e) => setTargetShift(e.target.value as TargetShift)}
              className={selectClassName}
            >
              {TARGET_SHIFT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-300">
              Recurrence
            </label>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-white/[0.04] p-1">
              {(["daily", "weekly", "once"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setScheduleType(type)}
                  className={`rounded-lg px-3 py-2 text-xs font-medium capitalize transition ${
                    scheduleType === type
                      ? "bg-zinc-100 font-semibold text-zinc-950"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {scheduleType === "weekly" && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => {
                  const active = daysOfWeek.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      className={`min-w-[44px] rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                        active
                          ? "border-white/25 bg-white/[0.1] text-zinc-100"
                          : "border-white/[0.08] bg-surface-input text-zinc-400 hover:border-white/[0.14] hover:text-zinc-200"
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
                  className={inputClassName}
                />
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-300">
              Scheduled Times{" "}
              <span className="text-zinc-500">(each time creates an independent occurrence)</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {times.map((t, index) => (
                <div
                  key={index}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-surface-input pr-1.5"
                >
                  <input
                    type="time"
                    value={t}
                    onChange={(e) => updateTimeAt(index, e.target.value)}
                    aria-label={`Scheduled time ${index + 1}`}
                    className="rounded-lg bg-transparent px-2.5 py-1.5 font-mono text-sm tabular-nums text-zinc-100 focus:outline-none"
                  />
                  {times.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTimeAt(index)}
                      className="rounded p-1 text-zinc-500 transition hover:text-red-400"
                      aria-label={`Remove time ${t}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={addTime}>
                <Plus className="h-3.5 w-3.5" />
                Add Time
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.06] pt-3.5">
            <div>
              <div className="text-sm font-medium text-zinc-200">Task Enabled</div>
              <div className="text-xs text-zinc-500">
                Disabled tasks pause future occurrences while keeping history
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Task Enabled"
              onClick={() => setEnabled((prev) => !prev)}
              className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition ${
                enabled ? "bg-zinc-100" : "bg-white/[0.1]"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full transition-transform ${
                  enabled ? "translate-x-5 bg-zinc-950" : "translate-x-1 bg-zinc-400"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.06] pt-4">
            {editingTask ? (
              <Button
                type="button"
                variant="danger"
                disabled={deleting || saving}
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md" disabled={saving || deleting}>
                {saving ? "Saving..." : editingTask ? "Save Changes" : "Create Task"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDeleteOpen}
        title="Delete Daily Task?"
        description={`"${editingTask?.title ?? ""}" will be removed from future schedules. Existing completion history will be preserved.`}
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </>
  );
}

export function DailyTasksView({
  rosterCache,
  onRosterLoaded,
  onOpenRosterModal,
}: DailyTasksViewProps) {
  const { showToast } = useToast();
  const [nowParts, setNowParts] = useState(() => getBucharestNowParts());
  const [selectedDate, setSelectedDate] = useState(() => getBucharestNowParts().date);

  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);

  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DailyTask | null>(null);
  const [completedCollapsed, setCompletedCollapsed] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowParts(getBucharestNowParts());
    }, 30_000);
    return () => window.clearInterval(timer);
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
  const pendingCount = grouped.overdue.length + grouped.dueNow.length + grouped.upcoming.length;

  const handleComplete = async (occ: DailyOccurrence, employee: string) => {
    const key = `${occ.occurrenceId}:${employee}`;
    const optimisticId = `optimistic:${key}:${Date.now()}`;
    const optimisticCompletion: TaskCompletion = {
      id: optimisticId,
      occurrenceId: occ.occurrenceId,
      taskId: occ.taskId,
      taskType: "DAILY",
      taskTitle: occ.taskTitle,
      scheduledDate: occ.scheduledDate,
      scheduledTime: occ.scheduledTime,
      completedBy: employee,
      completedAt: new Date().toISOString(),
    };

    setSubmittingKey(key);
    setCompletions((prev) => [...prev, optimisticCompletion]);

    try {
      const saved = await createCompletion({
        occurrenceId: occ.occurrenceId,
        taskId: occ.taskId,
        taskType: "DAILY",
        taskTitle: occ.taskTitle,
        scheduledDate: occ.scheduledDate,
        scheduledTime: occ.scheduledTime,
        completedBy: employee,
      });
      setCompletions((prev) =>
        prev.map((c) => (c.id === optimisticId ? saved : c))
      );
      showToast({
        tone: "success",
        title: "Task completed",
        description: `${occ.taskTitle} · ${employee}`,
      });
    } catch (err) {
      setCompletions((prev) => prev.filter((c) => c.id !== optimisticId));
      showToast({
        tone: "error",
        title: "Completion failed",
        description: getErrorMessage(err),
      });
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

  const renderOccurrenceRow = (occ: DailyOccurrence) => {
    const isCompleted = occ.status === "completed" && occ.completion !== null;

    const shiftShort =
      TARGET_SHIFT_OPTIONS.find((s) => s.value === occ.targetShift)?.short ??
      `Shift ${occ.targetShift}`;

    return (
      <article
        key={occ.occurrenceId}
        className="flex gap-3 border-b border-white/[0.06] py-3.5 last:border-b-0 sm:gap-4"
      >
        {/* Left Time Column */}
        <div
          className={`w-14 shrink-0 pt-0.5 font-mono text-sm tabular-nums ${
            isCompleted ? "text-zinc-500" : "text-zinc-100"
          }`}
        >
          {occ.scheduledTime}
        </div>

        {/* Right Content Column */}
        <div className="min-w-0 flex-1">
          <h3
            className={`text-[15px] font-medium leading-snug ${
              isCompleted ? "text-zinc-500 line-through" : "text-zinc-100"
            }`}
          >
            {occ.taskTitle}
          </h3>

          {occ.taskDescription && (
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              {occ.taskDescription}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
            {occ.status === "overdue" && <StatusDot tone="red">Overdue</StatusDot>}
            {occ.status === "dueNow" && <StatusDot tone="amber">Due Now</StatusDot>}
            {occ.status === "upcoming" && <StatusDot tone="neutral">Upcoming</StatusDot>}
            {isCompleted && <StatusDot tone="emerald">Completed</StatusDot>}
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">{shiftShort}</span>
          </div>

          {isCompleted && occ.completion ? (
            <div className="mt-2.5 flex items-center gap-1.5 text-xs text-emerald-300/80">
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span>{occ.completion.completedBy}</span>
              <span className="text-zinc-600">·</span>
              <span className="font-mono tabular-nums">
                {formatBucharestDateTime(occ.completion.completedAt).slice(11, 16)}
              </span>
            </div>
          ) : (
            <div className="mt-3">
              {occ.eligibleEmployees.length === 0 ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span>
                    {currentRoster
                      ? "No technicians scheduled on this shift at this time."
                      : "No monthly roster loaded for this date."}
                  </span>
                  {!currentRoster && (
                    <button
                      type="button"
                      onClick={onOpenRosterModal}
                      className="text-zinc-200 underline-offset-2 hover:underline"
                    >
                      Load Roster →
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
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
                          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                          ) : (
                            <Check className="h-3.5 w-3.5 text-zinc-500" />
                          )}
                          <span>{emp}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-zinc-600">Tap technician to complete</p>
                </div>
              )}
            </div>
          )}
        </div>
      </article>
    );
  };

  const renderSection = (
    title: string,
    items: DailyOccurrence[],
    tone: "red" | "amber" | "neutral" | "emerald",
    collapsible = false
  ) => {
    if (items.length === 0) return null;
    const isCollapsed = collapsible && completedCollapsed;

    return (
      <section className="space-y-1">
        <div className="flex items-center justify-between pb-1">
          <button
            type="button"
            disabled={!collapsible}
            onClick={() => collapsible && setCompletedCollapsed((p) => !p)}
            className={`inline-flex items-center gap-2 text-xs font-medium text-zinc-300 ${
              collapsible ? "cursor-pointer hover:text-zinc-100" : "cursor-default"
            }`}
          >
            <StatusDot tone={tone} className="text-zinc-300">
              <span>{title}</span>
            </StatusDot>
            <span className="font-mono tabular-nums text-zinc-500">{items.length}</span>
            {collapsible && (
              <ChevronDown
                className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${
                  isCollapsed ? "-rotate-90" : ""
                }`}
              />
            )}
          </button>
        </div>

        {!isCollapsed && (
          <div className="border-t border-white/[0.06]">{items.map(renderOccurrenceRow)}</div>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            Daily Tasks
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            One technician completion marks an occurrence done for the shift.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setSelectedDate(getPreviousCalendarDate(selectedDate))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) setSelectedDate(e.target.value);
              }}
              className="bg-transparent px-1.5 py-1 font-mono text-xs font-medium tabular-nums text-zinc-100 focus:outline-none sm:text-sm"
            />
            <button
              type="button"
              onClick={() => setSelectedDate(getNextCalendarDate(selectedDate))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {selectedDate !== nowParts.date && (
            <Button variant="ghost" onClick={() => setSelectedDate(nowParts.date)}>
              Today
            </Button>
          )}

          <Button variant="ghost" onClick={() => setManageModalOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" />
            <span>Manage ({tasks.length})</span>
          </Button>

          <Button
            variant="primary"
            onClick={() => {
              setEditingTask(null);
              setFormModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <span>Add Task</span>
          </Button>
        </div>
      </div>

      {/* Inline Status Summary */}
      {!loading && !error && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-white/[0.06] pb-3 text-xs text-zinc-500">
          <span>
            <span className="font-mono tabular-nums text-zinc-200">{pendingCount}</span> pending
          </span>
          {grouped.dueNow.length > 0 && (
            <>
              <span className="text-zinc-600">·</span>
              <span>
                <span className="font-mono tabular-nums text-zinc-200">
                  {grouped.dueNow.length}
                </span>{" "}
                due now
              </span>
            </>
          )}
          <span className="text-zinc-600">·</span>
          <span>
            <span className="font-mono tabular-nums text-zinc-200">
              {grouped.completed.length}
            </span>{" "}
            completed
          </span>
          {grouped.overdue.length > 0 && (
            <>
              <span className="text-zinc-600">·</span>
              <span>
                <span className="font-mono tabular-nums text-red-400">
                  {grouped.overdue.length}
                </span>{" "}
                overdue
              </span>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="border-t border-white/[0.06]">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : occurrences.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-5 w-5" />}
          title={`No tasks scheduled for ${selectedDate}`}
          description="Create a daily, weekly, or one-time task to start tracking shift completions."
          action={
            <Button
              variant="primary"
              onClick={() => {
                setEditingTask(null);
                setFormModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add Task
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {renderSection("Overdue", grouped.overdue, "red")}
          {renderSection("Due Now", grouped.dueNow, "amber")}
          {renderSection("Upcoming", grouped.upcoming, "neutral")}
          {renderSection("Completed", grouped.completed, "emerald", true)}
        </div>
      )}

      {/* Task Definitions Manager Modal */}
      <Modal
        isOpen={manageModalOpen}
        onClose={() => setManageModalOpen(false)}
        title="Daily Task Definitions"
        subtitle={`${tasks.length} configured task${tasks.length === 1 ? "" : "s"}`}
        icon={<Settings2 className="h-4 w-4" />}
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-3">
          {tasks.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-500">
              No daily tasks configured yet.
            </p>
          ) : (
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-zinc-100">
                        {task.title}
                      </span>
                      {!task.enabled && <StatusDot tone="neutral">Disabled</StatusDot>}
                    </div>
                    <div className="mt-1 font-mono text-xs tabular-nums text-zinc-500">
                      Shift {task.targetShift} · {task.schedule.type} · {task.times.join(", ")}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setManageModalOpen(false);
                      setEditingTask(task);
                      setFormModalOpen(true);
                    }}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end border-t border-white/[0.06] pt-3">
            <Button
              variant="primary"
              onClick={() => {
                setManageModalOpen(false);
                setEditingTask(null);
                setFormModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New Daily Task
            </Button>
          </div>
        </div>
      </Modal>

      <TaskFormModal
        isOpen={formModalOpen}
        editingTask={editingTask}
        defaultDate={selectedDate}
        onClose={() => setFormModalOpen(false)}
        onSaved={() => void loadData()}
      />
    </div>
  );
}
