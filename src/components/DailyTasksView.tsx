import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Loader2,
  MessageSquare,
  Plus,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import {
  createComment,
  createCompletion,
  createDailyTask,
  deleteDailyTask,
  fetchComments,
  fetchCompletions,
  fetchDailyTasks,
  fetchRoster,
  fetchScheduledMaintenance,
  getErrorMessage,
  logScheduledMaintenanceChange,
  updateDailyTask,
} from "../api/client";
import { compressImageToDataUrl } from "../utils/image";
import {
  DAILY_TASK_CATEGORIES,
  filterOccurrencesForCurrentShift,
  generateDailyOccurrences,
  getCurrentShiftWindow,
  getShiftStartTime,
  groupDailyOccurrences,
} from "../domain/dailySchedule";
import { generateScheduledDailyOccurrences } from "../domain/scheduledMaintenance";
import {
  formatBucharestDateTime,
  formatDisplayDate,
  getBucharestNowParts,
  getNextCalendarDate,
  getPreviousCalendarDate,
} from "../shared/timezone";
import type {
  DailyOccurrence,
  DailyTask,
  RosterData,
  ScheduledMaintenanceItem,
  ScheduledMaintenanceLog,
  TargetShift,
  TaskComment,
  TaskCompletion,
  TaskSchedule,
} from "../shared/types";
import { ConfirmDialog, Modal } from "./ui/Modal";
import {
  Button,
  EmptyState,
  SkeletonCard,
  StatusDot,
  Time24Input,
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
  const [category, setCategory] = useState("");
  const [targetShift, setTargetShift] = useState<TargetShift>("M");
  const [scheduleType, setScheduleType] = useState<"daily" | "weekly" | "interval" | "once">(
    "daily"
  );
  const [onceDate, setOnceDate] = useState(defaultDate);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [intervalDays, setIntervalDays] = useState<number>(5);
  const [intervalStartDate, setIntervalStartDate] = useState<string>(defaultDate);
  const [times, setTimes] = useState<string[]>(["08:00"]);
  const [timeMode, setTimeMode] = useState<"specific" | "shiftWindow">("specific");
  const [dueUntil, setDueUntil] = useState("10:00");
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
      setCategory(editingTask.category ?? "");
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
      setIntervalDays(
        editingTask.schedule.type === "interval" ? editingTask.schedule.everyDays : 5
      );
      setIntervalStartDate(
        editingTask.schedule.type === "interval"
          ? editingTask.schedule.startDate
          : defaultDate
      );
      setTimes(editingTask.times.length > 0 ? [...editingTask.times] : ["08:00"]);
      setTimeMode(editingTask.dueUntil ? "shiftWindow" : "specific");
      setDueUntil(editingTask.dueUntil ?? "10:00");
      setEnabled(editingTask.enabled);
    } else {
      setTitle("");
      setDescription("");
      setCategory("");
      setTargetShift("M");
      setScheduleType("daily");
      setOnceDate(defaultDate);
      setDaysOfWeek([1, 2, 3, 4, 5]);
      setIntervalDays(5);
      setIntervalStartDate(defaultDate);
      setTimes(["08:00"]);
      setTimeMode("specific");
      setDueUntil("10:00");
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
    if (scheduleType === "interval") {
      if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) {
        setError("Repeat interval must be between 1 and 365 days.");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(intervalStartDate)) {
        setError("Valid start date (YYYY-MM-DD) is required.");
        return;
      }
    }
    const shiftStart = getShiftStartTime(targetShift);
    const cleanedTimes =
      timeMode === "shiftWindow"
        ? [shiftStart]
        : Array.from(new Set(times.filter((t) => /^\d{2}:\d{2}$/.test(t)))).sort();

    if (cleanedTimes.length === 0) {
      setError("At least one scheduled time (HH:MM) is required.");
      return;
    }
    if (timeMode === "shiftWindow" && !/^\d{2}:\d{2}$/.test(dueUntil)) {
      setError("Valid deadline time (HH:MM) is required.");
      return;
    }

    let schedule: TaskSchedule;
    if (scheduleType === "daily") {
      schedule = { type: "daily" };
    } else if (scheduleType === "weekly") {
      schedule = { type: "weekly", daysOfWeek };
    } else if (scheduleType === "interval") {
      schedule = {
        type: "interval",
        everyDays: intervalDays,
        startDate: intervalStartDate,
      };
    } else {
      schedule = { type: "once", date: onceDate };
    }

    setSaving(true);
    try {
      const basePayload = {
        title: title.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        targetShift,
        schedule,
        times: cleanedTimes,
        enabled,
      };
      if (editingTask) {
        await updateDailyTask(editingTask.id, {
          ...basePayload,
          category: category.trim() || null,
          dueUntil: timeMode === "shiftWindow" ? dueUntil : null,
        });
        showToast({ tone: "success", title: "Task updated", description: basePayload.title });
      } else {
        await createDailyTask({
          ...basePayload,
          ...(timeMode === "shiftWindow" ? { dueUntil } : {}),
        });
        showToast({ tone: "success", title: "Task created", description: basePayload.title });
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
              Category <span className="text-zinc-500">(optional)</span>
            </label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {DAILY_TASK_CATEGORIES.map((cat) => {
                const active =
                  category.trim().toLowerCase() === cat.toLowerCase();
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(active ? "" : cat)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      active
                        ? "btn-primary-theme border-transparent font-semibold"
                        : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:border-white/[0.2]"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Or type custom category (auto-detected if empty)..."
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
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.04] p-1 sm:grid-cols-4">
              {(
                [
                  { value: "daily", label: "Daily" },
                  { value: "weekly", label: "Weekly" },
                  { value: "interval", label: "Every N days" },
                  { value: "once", label: "Once" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setScheduleType(opt.value)}
                  className={`rounded-lg px-2.5 py-2 text-xs font-medium transition ${
                    scheduleType === opt.value
                      ? "btn-primary-theme font-semibold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {opt.label}
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

            {scheduleType === "interval" && (
              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-zinc-400">
                    Repeat every (days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={intervalDays}
                    onChange={(e) =>
                      setIntervalDays(Math.max(1, Number.parseInt(e.target.value || "1", 10)))
                    }
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-zinc-400">
                    Starting from
                  </label>
                  <input
                    type="date"
                    value={intervalStartDate}
                    onChange={(e) => setIntervalStartDate(e.target.value)}
                    className={inputClassName}
                  />
                </div>
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
              Scheduled Time
            </label>
            <div className="mb-2.5 grid grid-cols-2 gap-1 rounded-lg bg-white/[0.04] p-1">
              <button
                type="button"
                onClick={() => setTimeMode("specific")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  timeMode === "specific"
                    ? "bg-zinc-100 font-semibold text-zinc-950"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Specific Times
              </button>
              <button
                type="button"
                onClick={() => setTimeMode("shiftWindow")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  timeMode === "shiftWindow"
                    ? "bg-zinc-100 font-semibold text-zinc-950"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Shift Start → Until
              </button>
            </div>

            {timeMode === "specific" ? (
              <div className="flex flex-wrap items-center gap-2">
                {times.map((t, index) => (
                  <div key={index} className="inline-flex items-center gap-1">
                    <Time24Input
                      value={t}
                      onChange={(next) => updateTimeAt(index, next)}
                      ariaLabel={`Scheduled time ${index + 1}`}
                    />
                    {times.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTimeAt(index)}
                        className="rounded p-1.5 text-zinc-500 transition hover:text-red-400"
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
            ) : (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg border border-white/[0.08] bg-surface-input px-3 py-1.5 font-mono text-sm tabular-nums text-zinc-300">
                    {getShiftStartTime(targetShift)}
                  </span>
                  <span className="text-xs text-zinc-500">until</span>
                  <Time24Input
                    value={dueUntil}
                    onChange={setDueUntil}
                    ariaLabel="Due until time"
                  />
                </div>
                <p className="text-[11px] text-zinc-500">
                  Due from shift start until this time (overnight supported for Night shift).
                </p>
              </div>
            )}
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

interface TaskCommentsModalProps {
  occurrence: DailyOccurrence | null;
  comments: TaskComment[];
  onClose: () => void;
  onCommentAdded: (comment: TaskComment) => void;
}

function TaskCommentsModal({
  occurrence,
  comments,
  onClose,
  onCommentAdded,
}: TaskCommentsModalProps) {
  const { showToast } = useToast();
  const [author, setAuthor] = useState("");
  const [message, setMessage] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!occurrence) return;
    setError(null);
    setMessage("");
    setPhotoDataUrl(null);
    setPreviewPhoto(null);
    setAuthor((prev) =>
      occurrence.eligibleEmployees.length > 0
        ? occurrence.eligibleEmployees.includes(prev)
          ? prev
          : occurrence.eligibleEmployees[0]
        : prev
    );
  }, [occurrence]);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setCompressing(true);
    try {
      const compressed = await compressImageToDataUrl(file);
      setPhotoDataUrl(compressed);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCompressing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!occurrence) return;
    setError(null);

    if (!author.trim()) {
      setError("Please enter or select your name.");
      return;
    }
    if (!message.trim() && !photoDataUrl) {
      setError("Write a message or attach a photo.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createComment({
        occurrenceId: occurrence.occurrenceId,
        taskId: occurrence.taskId,
        taskTitle: occurrence.taskTitle,
        scheduledDate: occurrence.scheduledDate,
        author: author.trim(),
        message: message.trim(),
        ...(photoDataUrl ? { photoDataUrl } : {}),
      });
      onCommentAdded(created);
      setMessage("");
      setPhotoDataUrl(null);
      showToast({ tone: "success", title: "Comment added" });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={occurrence !== null}
        onClose={onClose}
        title={occurrence ? `Comments · ${occurrence.taskTitle}` : "Comments"}
        subtitle={
          occurrence
            ? `${formatDisplayDate(occurrence.scheduledDate)} · ${occurrence.scheduledTime}`
            : undefined
        }
        icon={<MessageSquare className="h-4 w-4" />}
        maxWidthClass="max-w-lg"
      >
        <div className="space-y-4">
          {comments.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/[0.08] py-6 text-center text-xs text-zinc-500">
              No comments yet. Leave a note or attach a photo below.
            </p>
          ) : (
            <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
              {comments.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-zinc-100">{c.author}</span>
                    <span className="font-mono tabular-nums text-zinc-500">
                      {formatBucharestDateTime(c.createdAt)}
                    </span>
                  </div>
                  {c.message && (
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-zinc-200">
                      {c.message}
                    </p>
                  )}
                  {c.photoDataUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewPhoto(c.photoDataUrl ?? null)}
                      className="mt-2 block overflow-hidden rounded-lg border border-white/[0.08]"
                    >
                      <img
                        src={c.photoDataUrl}
                        alt={`Attachment from ${c.author}`}
                        className="max-h-48 w-auto object-contain"
                      />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3 border-t border-white/[0.06] pt-3">
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-300">
                Technician
              </label>
              {occurrence && occurrence.eligibleEmployees.length > 0 ? (
                <select
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className={selectClassName}
                >
                  {occurrence.eligibleEmployees.map((emp) => (
                    <option key={emp} value={emp}>
                      {emp}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Your name"
                  className={inputClassName}
                />
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-300">
                Message
              </label>
              <textarea
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add notes, observations, or issue details..."
                className={inputClassName}
              />
            </div>

            {photoDataUrl && (
              <div className="relative inline-block overflow-hidden rounded-lg border border-white/[0.08]">
                <img
                  src={photoDataUrl}
                  alt="Selected attachment preview"
                  className="max-h-32 w-auto object-contain"
                />
                <button
                  type="button"
                  onClick={() => setPhotoDataUrl(null)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1 text-white"
                  aria-label="Remove attached photo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-white/[0.14] hover:bg-white/[0.07]">
                <Camera className="h-3.5 w-3.5" />
                <span>{compressing ? "Preparing photo..." : "Attach photo"}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handlePhotoChange(e)}
                  disabled={compressing || submitting}
                  className="sr-only"
                />
              </label>

              <Button
                type="submit"
                variant="primary"
                disabled={submitting || compressing}
              >
                {submitting ? "Posting..." : "Post Comment"}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      <Modal
        isOpen={previewPhoto !== null}
        onClose={() => setPreviewPhoto(null)}
        title="Photo Attachment"
        maxWidthClass="max-w-3xl"
      >
        {previewPhoto && (
          <img
            src={previewPhoto}
            alt="Full-size attachment"
            className="mx-auto max-h-[75vh] w-auto rounded-lg object-contain"
          />
        )}
      </Modal>
    </>
  );
}

function parseHHMMToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isDueWithinOneHour(
  occ: DailyOccurrence,
  nowDate: string,
  nowTime: string
): boolean {
  if (!occ.dueUntil) return true;
  const [sy, sm, sd] = occ.scheduledDate.split("-").map(Number);
  const [ny, nm, nd] = nowDate.split("-").map(Number);
  if (!sy || !sm || !sd || !ny || !nm || !nd) return true;
  const dayDiff = Math.round(
    (Date.UTC(ny, nm - 1, nd) - Date.UTC(sy, sm - 1, sd)) / 86_400_000
  );
  const schedMins = parseHHMMToMinutes(occ.scheduledTime);
  const dueMins = parseHHMMToMinutes(occ.dueUntil);
  const crossesMidnight = dueMins < schedMins;
  const dueTotalMins = dueMins + (crossesMidnight ? 1440 : 0);
  const nowTotalMins = dayDiff * 1440 + parseHHMMToMinutes(nowTime);
  return dueTotalMins - nowTotalMins <= 60;
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
  const [scheduledItems, setScheduledItems] = useState<
    ScheduledMaintenanceItem[]
  >([]);
  const [scheduledLogs, setScheduledLogs] = useState<ScheduledMaintenanceLog[]>(
    []
  );
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [commentTarget, setCommentTarget] = useState<DailyOccurrence | null>(null);

  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [manageShiftFilter, setManageShiftFilter] = useState<"ALL" | TargetShift>("ALL");
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DailyTask | null>(null);
  const [completedCollapsed, setCompletedCollapsed] = useState(false);
  const [shiftFilter, setShiftFilter] = useState<"M" | "A" | "N">(
    () => getCurrentShiftWindow(getBucharestNowParts().time).primaryShift
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = getBucharestNowParts();
      setNowParts((prev) => {
        if (prev.date !== next.date) {
          setSelectedDate((sel) => (sel === prev.date ? next.date : sel));
        }
        return next;
      });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const currentMonthKey = selectedDate.slice(0, 7);
  const prevDate = useMemo(() => getPreviousCalendarDate(selectedDate), [selectedDate]);
  const prevMonthKey = prevDate.slice(0, 7);
  const shiftWindow = useMemo(() => getCurrentShiftWindow(nowParts.time), [nowParts.time]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const needsPrevCompletions = shiftWindow.nightHalf === "second";
      const [
        tasksRes,
        completionsRes,
        prevCompletionsRes,
        commentsRes,
        prevCommentsRes,
        scheduledRes,
      ] = await Promise.all([
        fetchDailyTasks(),
        fetchCompletions({ date: selectedDate }),
        needsPrevCompletions ? fetchCompletions({ date: prevDate }) : Promise.resolve([]),
        fetchComments({ date: selectedDate }),
        needsPrevCompletions ? fetchComments({ date: prevDate }) : Promise.resolve([]),
        fetchScheduledMaintenance(),
      ]);
      setTasks(tasksRes);
      setScheduledItems(scheduledRes.items);
      setScheduledLogs(scheduledRes.logs);
      const mergedMap = new Map<string, TaskCompletion>();
      for (const c of completionsRes) mergedMap.set(c.id, c);
      for (const c of prevCompletionsRes) mergedMap.set(c.id, c);
      setCompletions(Array.from(mergedMap.values()));

      const mergedComments = new Map<string, TaskComment>();
      for (const c of commentsRes) mergedComments.set(c.id, c);
      for (const c of prevCommentsRes) mergedComments.set(c.id, c);
      setComments(
        Array.from(mergedComments.values()).sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt)
        )
      );

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
  }, [selectedDate, prevDate, shiftWindow.nightHalf, currentMonthKey, prevMonthKey, rosterCache, onRosterLoaded]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const currentRoster = rosterCache[currentMonthKey] ?? null;
  const previousRoster =
    prevMonthKey === currentMonthKey ? currentRoster : (rosterCache[prevMonthKey] ?? null);

  const dayOccurrences = useMemo(() => {
    const daily = generateDailyOccurrences({
      tasks,
      selectedDate,
      completions,
      currentRoster,
      previousRoster,
      nowDate: nowParts.date,
      nowTime: nowParts.time,
    });
    const scheduled = generateScheduledDailyOccurrences({
      items: scheduledItems,
      logs: scheduledLogs,
      selectedDate,
      currentRoster,
      previousRoster,
      nowDate: nowParts.date,
      nowTime: nowParts.time,
    });
    return [...daily, ...scheduled].sort((a, b) => {
      const t = a.scheduledTime.localeCompare(b.scheduledTime);
      return t !== 0 ? t : a.taskTitle.localeCompare(b.taskTitle);
    });
  }, [
    tasks,
    scheduledItems,
    scheduledLogs,
    selectedDate,
    completions,
    currentRoster,
    previousRoster,
    nowParts.date,
    nowParts.time,
  ]);

  const prevDateOccurrences = useMemo(() => {
    if (shiftFilter !== "N" || shiftWindow.nightHalf !== "second") {
      return [];
    }
    const daily = generateDailyOccurrences({
      tasks,
      selectedDate: prevDate,
      completions,
      currentRoster: previousRoster,
      previousRoster: null,
      nowDate: nowParts.date,
      nowTime: nowParts.time,
    });
    const scheduled = generateScheduledDailyOccurrences({
      items: scheduledItems,
      logs: scheduledLogs,
      selectedDate: prevDate,
      currentRoster: previousRoster,
      previousRoster: null,
      nowDate: nowParts.date,
      nowTime: nowParts.time,
    });
    return [...daily, ...scheduled];
  }, [
    shiftFilter,
    shiftWindow.nightHalf,
    tasks,
    scheduledItems,
    scheduledLogs,
    prevDate,
    completions,
    previousRoster,
    nowParts.date,
    nowParts.time,
  ]);

  const occurrences = useMemo(() => {
    if (shiftFilter === shiftWindow.primaryShift) {
      return filterOccurrencesForCurrentShift({
        occurrences: dayOccurrences,
        prevDateOccurrences,
        nowTime: nowParts.time,
        selectedDate,
        nowDate: nowParts.date,
      });
    }
    if (shiftFilter === "M") {
      return filterOccurrencesForCurrentShift({
        occurrences: dayOccurrences,
        nowTime: "10:00",
        selectedDate,
        nowDate: nowParts.date,
      });
    }
    if (shiftFilter === "A") {
      return filterOccurrencesForCurrentShift({
        occurrences: dayOccurrences,
        nowTime: "18:00",
        selectedDate,
        nowDate: nowParts.date,
      });
    }
    // Night selected while not currently in Night shift: show all Night/ALL_ACTIVE tasks in 22:00–05:59
    return dayOccurrences.filter((occ) => {
      if (occ.targetShift === "N") return true;
      if (occ.targetShift === "ALL_ACTIVE") {
        const [h] = occ.scheduledTime.split(":").map(Number);
        return h >= 22 || h < 6;
      }
      return false;
    });
  }, [
    shiftFilter,
    shiftWindow.primaryShift,
    dayOccurrences,
    prevDateOccurrences,
    nowParts.time,
    selectedDate,
    nowParts.date,
  ]);

  const grouped = useMemo(
    () => groupDailyOccurrences(occurrences),
    [occurrences]
  );
  const dueNowStrict = useMemo(
    () => grouped.dueNow.filter((o) => !o.dueUntil),
    [grouped.dueNow]
  );
  const dueUntilTasks = useMemo(
    () => grouped.dueNow.filter((o) => Boolean(o.dueUntil)),
    [grouped.dueNow]
  );
  const dueUntilHasUrgent = useMemo(
    () =>
      dueUntilTasks.some((o) =>
        isDueWithinOneHour(o, nowParts.date, nowParts.time)
      ),
    [dueUntilTasks, nowParts.date, nowParts.time]
  );
  const dueUntilDeadlines = useMemo(
    () =>
      Array.from(
        new Set(
          dueUntilTasks
            .map((o) => o.dueUntil)
            .filter((v): v is string => Boolean(v))
        )
      ),
    [dueUntilTasks]
  );
  const dueUntilSectionTitle =
    dueUntilDeadlines.length > 0
      ? `Due Until ${dueUntilDeadlines.join(", ")}`
      : "Due Until";
  const pendingCount = grouped.overdue.length + grouped.dueNow.length + grouped.upcoming.length;
  const filteredManageTasks = useMemo(
    () =>
      manageShiftFilter === "ALL"
        ? tasks
        : tasks.filter((t) => t.targetShift === manageShiftFilter),
    [tasks, manageShiftFilter]
  );

  const commentsByOccurrence = useMemo(() => {
    const map = new Map<string, TaskComment[]>();
    for (const c of comments) {
      const list = map.get(c.occurrenceId);
      if (list) {
        list.push(c);
      } else {
        map.set(c.occurrenceId, [c]);
      }
    }
    return map;
  }, [comments]);

  const handleComplete = async (occ: DailyOccurrence, employee: string) => {
    const key = `${occ.occurrenceId}:${employee}`;

    if (occ.source === "SCHEDULED" && occ.scheduledItemId) {
      setSubmittingKey(key);
      try {
        const createdLog = await logScheduledMaintenanceChange({
          itemId: occ.scheduledItemId,
          changedBy: employee,
        });
        setScheduledLogs((prev) =>
          [createdLog, ...prev].sort((a, b) =>
            b.changedAt.localeCompare(a.changedAt)
          )
        );
        showToast({
          tone: "success",
          title: "Scheduled change logged",
          description: `${occ.taskTitle} · ${employee}`,
        });
      } catch (err) {
        showToast({
          tone: "error",
          title: "Failed to log scheduled change",
          description: getErrorMessage(err),
        });
      } finally {
        setSubmittingKey(null);
      }
      return;
    }

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
    const occComments = commentsByOccurrence.get(occ.occurrenceId) ?? [];

    return (
      <article
        key={occ.occurrenceId}
        className="flex gap-2.5 border-b border-white/[0.06] py-2 last:border-b-0"
      >
        {/* Left Time Column */}
        <div
          className={`w-12 shrink-0 pt-0.5 font-mono text-xs tabular-nums ${
            isCompleted ? "text-zinc-500" : "text-zinc-100"
          }`}
        >
          <div>{occ.scheduledTime}</div>
          {occ.dueUntil && (
            <div className="text-[10px] text-zinc-500">→ {occ.dueUntil}</div>
          )}
        </div>

        {/* Right Content Column */}
        <div className="min-w-0 flex-1">
          <h3
            className={`text-sm font-medium leading-snug ${
              isCompleted ? "text-zinc-500 line-through" : "text-zinc-100"
            }`}
          >
            {occ.taskTitle}
          </h3>

          {occ.taskDescription && (
            <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
              {occ.taskDescription}
            </p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {occ.status === "overdue" && <StatusDot tone="red">Overdue</StatusDot>}
            {occ.status === "dueNow" &&
              (occ.dueUntil ? (
                <StatusDot
                  tone={
                    isDueWithinOneHour(occ, nowParts.date, nowParts.time)
                      ? "amber"
                      : "emerald"
                  }
                >
                  Due until {occ.dueUntil}
                </StatusDot>
              ) : (
                <StatusDot tone="amber">Due Now</StatusDot>
              ))}
            {occ.status === "upcoming" && <StatusDot tone="neutral">Upcoming</StatusDot>}
            {isCompleted && <StatusDot tone="emerald">Completed</StatusDot>}
            {occ.category && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-zinc-300">
                  {occ.category}
                </span>
              </>
            )}
          </div>

          {isCompleted && occ.completion ? (
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-300/80">
              <Check className="h-3 w-3 shrink-0" />
              <span>{occ.completion.completedBy}</span>
              <span className="text-zinc-600">·</span>
              <span className="font-mono tabular-nums">
                {formatBucharestDateTime(occ.completion.completedAt).slice(11, 16)}
              </span>
            </div>
          ) : (
            <div className="mt-1.5">
              {occ.eligibleEmployees.length === 0 ? (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
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
                <div className="flex flex-wrap gap-1.5">
                  {occ.eligibleEmployees.map((emp) => {
                    const key = `${occ.occurrenceId}:${emp}`;
                    const busy = submittingKey === key;
                    return (
                      <button
                        key={emp}
                        type="button"
                        disabled={submittingKey !== null}
                        onClick={() => void handleComplete(occ, emp)}
                        className="inline-flex min-h-[30px] items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-zinc-200 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
                      >
                        {busy ? (
                          <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
                        ) : (
                          <Check className="h-3 w-3 text-zinc-500" />
                        )}
                        <span>{emp}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Comments Column */}
        <div className="shrink-0 pt-0.5">
          <button
            type="button"
            onClick={() => setCommentTarget(occ)}
            aria-label={`Comments for ${occ.taskTitle}`}
            className="inline-flex min-h-[30px] items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-xs font-medium text-zinc-300 transition hover:border-white/[0.14] hover:bg-white/[0.07]"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Comments</span>
            {occComments.length > 0 && (
              <span className="rounded-full bg-white/[0.07] px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-zinc-200">
                {occComments.length}
              </span>
            )}
          </button>
        </div>
      </article>
    );
  };

  const renderSection = (
    title: string,
    items: DailyOccurrence[],
    tone: "red" | "amber" | "neutral" | "emerald",
    collapsible = false,
    hideHeader = false
  ) => {
    if (items.length === 0) return null;
    const isCollapsed = collapsible && completedCollapsed;

    return (
      <section className="space-y-1">
        {!hideHeader && (
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
        )}

        {!isCollapsed && (
          <div className="border-t border-white/[0.06]">{items.map(renderOccurrenceRow)}</div>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header & Controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            Daily Tasks
          </h1>
          <p className="mt-0.5 hidden text-xs text-zinc-500 sm:block">
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

      {/* Inline Status Summary + Shift Filter */}
      {!loading && !error && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3 text-xs text-zinc-500">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              <span className="font-mono tabular-nums text-zinc-200">{pendingCount}</span> pending
            </span>
            {dueNowStrict.length > 0 && (
              <>
                <span className="text-zinc-600">·</span>
                <span>
                  <span className="font-mono tabular-nums text-zinc-200">
                    {dueNowStrict.length}
                  </span>{" "}
                  due now
                </span>
              </>
            )}
            {dueUntilTasks.length > 0 && (
              <>
                <span className="text-zinc-600">·</span>
                <span>
                  <span className="font-mono tabular-nums text-zinc-200">
                    {dueUntilTasks.length}
                  </span>{" "}
                  due until {dueUntilDeadlines.join(", ")}
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

          <div className="inline-flex rounded-lg bg-white/[0.04] p-0.5">
            {(
              [
                { value: "M", label: "Morning" },
                { value: "A", label: "After" },
                { value: "N", label: "Night" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setShiftFilter(opt.value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  shiftFilter === opt.value
                    ? "btn-primary-theme font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
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
        <div className="space-y-4">
          {renderSection("Overdue", grouped.overdue, "red")}
          {renderSection("Due Now", dueNowStrict, "amber")}
          {renderSection(
            dueUntilSectionTitle,
            dueUntilTasks,
            dueUntilHasUrgent ? "amber" : "emerald",
            false,
            true
          )}
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
            <>
              <div className="flex flex-wrap gap-1 rounded-lg bg-white/[0.04] p-1">
                {(
                  [
                    { value: "ALL", label: "All" },
                    { value: "M", label: "Morning" },
                    { value: "A", label: "After" },
                    { value: "N", label: "Night" },
                    { value: "ALL_ACTIVE", label: "All Active" },
                    ...(tasks.some((t) => t.targetShift === "MID")
                      ? [{ value: "MID" as const, label: "Midday" }]
                      : []),
                  ] as Array<{ value: "ALL" | TargetShift; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setManageShiftFilter(opt.value)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                      manageShiftFilter === opt.value
                        ? "btn-primary-theme font-semibold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {filteredManageTasks.length === 0 ? (
                <p className="py-6 text-center text-xs text-zinc-500">
                  No tasks configured for this shift.
                </p>
              ) : (
                <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
                  {filteredManageTasks.map((task) => (
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
                          Shift {task.targetShift} ·{" "}
                          {task.schedule.type === "interval"
                            ? `every ${task.schedule.everyDays}d from ${task.schedule.startDate}`
                            : task.schedule.type}{" "}
                          ·{" "}
                          {task.dueUntil
                            ? `${task.times[0]} → ${task.dueUntil}`
                            : task.times.join(", ")}
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
            </>
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

      <TaskCommentsModal
        occurrence={commentTarget}
        comments={
          commentTarget ? (commentsByOccurrence.get(commentTarget.occurrenceId) ?? []) : []
        }
        onClose={() => setCommentTarget(null)}
        onCommentAdded={(created) => setComments((prev) => [...prev, created])}
      />
    </div>
  );
}
