import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  Loader2,
  Plus,
  Settings2,
  Trash2,
  UserCheck,
  Users,
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
  StatusBadge,
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
  const [newTime, setNewTime] = useState("12:00");
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
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
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
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Description <span className="text-slate-500">(optional)</span>
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
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
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
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Recurrence
            </label>
            <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-white/[0.08] bg-surface-input p-1">
              {(["daily", "weekly", "once"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setScheduleType(type)}
                  className={`rounded-lg px-3 py-2 text-xs font-medium capitalize transition ${
                    scheduleType === type
                      ? "bg-amber-500 text-slate-950 font-semibold shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
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
                          ? "border-amber-400/60 bg-amber-500/15 text-amber-300"
                          : "border-white/[0.08] bg-surface-input text-slate-400 hover:border-white/[0.15]"
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
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Scheduled Times <span className="text-slate-500">(each time creates an independent occurrence)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {times.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-surface-input px-2.5 py-1.5 font-mono text-xs font-medium text-slate-100"
                >
                  {t}
                  {times.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTime(t)}
                      className="text-slate-400 transition hover:text-red-400"
                      aria-label={`Remove time ${t}`}
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
                className="rounded-lg border border-white/[0.1] bg-surface-input px-3 py-1.5 font-mono text-sm text-slate-100 focus:border-amber-400/70 focus:outline-none"
              />
              <Button type="button" variant="secondary" onClick={addTime}>
                <Plus className="h-3.5 w-3.5" />
                Add Time
              </Button>
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/[0.07] bg-surface-input px-3.5 py-2.5">
            <div>
              <div className="text-sm font-medium text-slate-200">Task Enabled</div>
              <div className="text-xs text-slate-400">
                Disabled tasks pause future occurrences while keeping history
              </div>
            </div>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-surface-input text-amber-500 focus:ring-amber-400"
            />
          </label>

          <div className="flex items-center justify-between border-t border-white/[0.07] pt-4">
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

  const renderOccurrenceCard = (occ: DailyOccurrence) => {
    const isCompleted = occ.status === "completed" && occ.completion !== null;

    const accentBar = isCompleted
      ? "border-l-emerald-500"
      : occ.status === "overdue"
        ? "border-l-red-500"
        : occ.status === "dueNow"
          ? "border-l-amber-400"
          : "border-l-slate-600";

    const shiftShort =
      TARGET_SHIFT_OPTIONS.find((s) => s.value === occ.targetShift)?.short ??
      `Shift ${occ.targetShift}`;

    return (
      <article
        key={occ.occurrenceId}
        className={`rounded-2xl border border-white/[0.08] border-l-[3px] bg-surface-card p-4 shadow-card transition hover:border-white/[0.13] ${accentBar}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-slate-100">
                <Clock className="h-3 w-3 text-amber-400" />
                {occ.scheduledTime}
              </span>
              <StatusBadge tone="neutral">{shiftShort}</StatusBadge>
              {occ.status === "overdue" && (
                <StatusBadge tone="red">
                  <AlertTriangle className="h-3 w-3" />
                  Overdue
                </StatusBadge>
              )}
              {occ.status === "dueNow" && (
                <StatusBadge tone="amber">
                  <Clock className="h-3 w-3" />
                  Due Now
                </StatusBadge>
              )}
              {isCompleted && (
                <StatusBadge tone="emerald">
                  <CheckCircle2 className="h-3 w-3" />
                  Completed
                </StatusBadge>
              )}
            </div>

            <h3 className="mt-2.5 text-base font-semibold leading-snug text-slate-100">
              {occ.taskTitle}
            </h3>
            {occ.taskDescription && (
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                {occ.taskDescription}
              </p>
            )}
          </div>
        </div>

        {isCompleted && occ.completion ? (
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-xs">
            <span className="inline-flex items-center gap-2 font-semibold text-emerald-200">
              <UserCheck className="h-4 w-4 text-emerald-400" />
              {occ.completion.completedBy}
            </span>
            <span className="font-mono tabular-nums text-emerald-300/80">
              {formatBucharestDateTime(occ.completion.completedAt)}
            </span>
          </div>
        ) : (
          <div className="mt-3.5 border-t border-white/[0.06] pt-3">
            {occ.eligibleEmployees.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>
                  {currentRoster
                    ? "No technicians scheduled on this shift at this time."
                    : "No monthly roster loaded for this date."}
                </span>
                {!currentRoster && (
                  <button
                    type="button"
                    onClick={onOpenRosterModal}
                    className="font-medium text-amber-400 hover:text-amber-300"
                  >
                    Load Roster →
                  </button>
                )}
              </div>
            ) : (
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                  <Users className="h-3 w-3" />
                  <span>Tap technician to complete</span>
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
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-slate-100 transition hover:border-emerald-500/50 hover:bg-emerald-500/15 hover:text-emerald-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                        ) : (
                          <Check className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        <span>{emp}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </article>
    );
  };

  const renderSection = (
    title: string,
    items: DailyOccurrence[],
    tone: "red" | "amber" | "slate" | "emerald",
    icon: typeof AlertTriangle,
    collapsible = false
  ) => {
    if (items.length === 0) return null;
    const Icon = icon;
    const labelColor =
      tone === "red"
        ? "text-red-400"
        : tone === "amber"
          ? "text-amber-400"
          : tone === "emerald"
            ? "text-emerald-400"
            : "text-slate-400";

    const isCollapsed = collapsible && completedCollapsed;

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={!collapsible}
            onClick={() => collapsible && setCompletedCollapsed((p) => !p)}
            className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${labelColor} ${
              collapsible ? "cursor-pointer hover:opacity-80" : "cursor-default"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{title}</span>
            <span className="rounded-full bg-white/[0.07] px-2 py-0.5 font-mono text-[11px] tabular-nums text-slate-200">
              {items.length}
            </span>
            {collapsible && (
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
              />
            )}
          </button>
        </div>

        {!isCollapsed && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {items.map(renderOccurrenceCard)}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">
            Daily Tasks
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">
            One technician completion marks an occurrence done for the shift.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-white/[0.09] bg-surface p-0.5">
            <button
              type="button"
              onClick={() => setSelectedDate(getPreviousCalendarDate(selectedDate))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-100"
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
              className="bg-transparent px-2 py-1 font-mono text-xs font-medium tabular-nums text-slate-100 focus:outline-none sm:text-sm"
            />
            <button
              type="button"
              onClick={() => setSelectedDate(getNextCalendarDate(selectedDate))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-slate-100"
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {selectedDate !== nowParts.date && (
            <Button variant="secondary" onClick={() => setSelectedDate(nowParts.date)}>
              Today
            </Button>
          )}

          <Button variant="secondary" onClick={() => setManageModalOpen(true)}>
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

      {/* Status Summary Bar */}
      {!loading && !error && (
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          <div className="rounded-xl border border-white/[0.07] bg-surface px-3.5 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Pending
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-xl font-semibold tabular-nums text-slate-100">
                {pendingCount}
              </span>
              {grouped.dueNow.length > 0 && (
                <span className="text-xs font-medium text-amber-400">
                  {grouped.dueNow.length} due now
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-surface px-3.5 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Completed
            </div>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-emerald-400">
              {grouped.completed.length}
            </div>
          </div>

          <div
            className={`rounded-xl border px-3.5 py-3 ${
              grouped.overdue.length > 0
                ? "border-red-500/30 bg-red-500/[0.07]"
                : "border-white/[0.07] bg-surface"
            }`}
          >
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Overdue
            </div>
            <div
              className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
                grouped.overdue.length > 0 ? "text-red-400" : "text-slate-400"
              }`}
            >
              {grouped.overdue.length}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
        <div className="space-y-7">
          {renderSection("Overdue", grouped.overdue, "red", AlertTriangle)}
          {renderSection("Due Now", grouped.dueNow, "amber", Clock)}
          {renderSection("Upcoming", grouped.upcoming, "slate", Calendar)}
          {renderSection("Completed", grouped.completed, "emerald", CheckCircle2, true)}
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
            <p className="py-6 text-center text-xs text-slate-400">
              No daily tasks configured yet.
            </p>
          ) : (
            <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.08] bg-surface-input">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-100">
                        {task.title}
                      </span>
                      {!task.enabled && <StatusBadge tone="neutral">Disabled</StatusBadge>}
                    </div>
                    <div className="mt-1 font-mono text-xs text-slate-400">
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
          <div className="flex justify-end pt-2">
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
