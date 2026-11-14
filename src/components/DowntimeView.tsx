import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  Loader2,
  Moon,
  Plus,
  Settings2,
  Sun,
  Trash2,
} from "lucide-react";
import {
  createCompletion,
  createMaintenanceTask,
  deleteMaintenanceTask,
  fetchCompletions,
  fetchMaintenanceTasks,
  fetchRoster,
  getErrorMessage,
  updateMaintenanceTask,
} from "../api/client";
import {
  generateMaintenanceOccurrencesForMonth,
  getMaintenanceDatesForMonth,
} from "../domain/maintenanceSchedule";
import {
  formatBucharestDateTime,
  formatMonthKey,
  getBucharestNowParts,
  parseMonthKey,
} from "../shared/timezone";
import type {
  MaintenanceOccurrence,
  MaintenanceTask,
  MaintenanceWindow,
  RosterData,
  TaskCompletion,
} from "../shared/types";
import { ConfirmDialog, Modal } from "./ui/Modal";
import {
  Button,
  EmptyState,
  SkeletonCard,
  StatusDot,
  inputClassName,
} from "./ui/Primitives";
import { useToast } from "./ui/Toast";

interface DowntimeViewProps {
  rosterCache: Record<string, RosterData | null>;
  onRosterLoaded: (monthKey: string, roster: RosterData | null) => void;
  onOpenRosterModal: () => void;
}

interface MaintenanceFormModalProps {
  isOpen: boolean;
  editingTask: MaintenanceTask | null;
  onClose: () => void;
  onSaved: () => void;
}

function MaintenanceFormModal({
  isOpen,
  editingTask,
  onClose,
  onSaved,
}: MaintenanceFormModalProps) {
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [windowVal, setWindowVal] = useState<MaintenanceWindow>("MORNING");
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
      setWindowVal(editingTask.window);
      setEnabled(editingTask.enabled);
    } else {
      setTitle("");
      setDescription("");
      setWindowVal("MORNING");
      setEnabled(true);
    }
  }, [isOpen, editingTask]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Maintenance task title is required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        window: windowVal,
        enabled,
      };
      if (editingTask) {
        await updateMaintenanceTask(editingTask.id, payload);
        showToast({ tone: "success", title: "Definition updated", description: payload.title });
      } else {
        await createMaintenanceTask(payload);
        showToast({ tone: "success", title: "Definition created", description: payload.title });
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
      await deleteMaintenanceTask(editingTask.id);
      showToast({ tone: "info", title: "Definition deleted", description: editingTask.title });
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
        title={editingTask ? "Edit Maintenance Definition" : "New Maintenance Definition"}
        subtitle="Reused automatically every month on the scheduled maintenance dates"
        maxWidthClass="max-w-md"
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
              placeholder="e.g. Cabinet power supply & fan cleaning"
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
              placeholder="Maintenance procedure notes..."
              className={inputClassName}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-300">
              Maintenance Window
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWindowVal("MORNING")}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition ${
                  windowVal === "MORNING"
                    ? "border-white/25 bg-white/[0.1] text-zinc-100"
                    : "border-white/[0.08] bg-surface-input text-zinc-400 hover:border-white/[0.14] hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <Sun className="h-3.5 w-3.5" />
                  <span>Morning (M)</span>
                </div>
                <span className="text-[11px] text-zinc-500">1st Mon–Wed · 06:00–14:00</span>
              </button>

              <button
                type="button"
                onClick={() => setWindowVal("NIGHT")}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition ${
                  windowVal === "NIGHT"
                    ? "border-white/25 bg-white/[0.1] text-zinc-100"
                    : "border-white/[0.08] bg-surface-input text-zinc-400 hover:border-white/[0.14] hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <Moon className="h-3.5 w-3.5" />
                  <span>Night (N)</span>
                </div>
                <span className="text-[11px] text-zinc-500">3rd Mon–Wed · 22:00–06:00</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/[0.06] pt-3.5">
            <div>
              <div className="text-sm font-medium text-zinc-200">Definition Enabled</div>
              <div className="text-xs text-zinc-500">
                Historical records remain preserved if disabled
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Definition Enabled"
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
        title="Delete Maintenance Definition?"
        description={`"${editingTask?.title ?? ""}" will no longer be generated for future months. Past completion records stay intact.`}
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </>
  );
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  const totalMonths = parsed.year * 12 + (parsed.month1Based - 1) + delta;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth1 = (totalMonths % 12) + 1;
  return formatMonthKey(newYear, newMonth1);
}

function formatMonthTitle(monthKey: string): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  const d = new Date(Date.UTC(parsed.year, parsed.month1Based - 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

function formatShortDate(isoDate: string): { weekday: string; dayNum: string; monthShort: string } {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return {
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(dt),
    dayNum: String(d).padStart(2, "0"),
    monthShort: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(dt),
  };
}

export function DowntimeView({
  rosterCache,
  onRosterLoaded,
  onOpenRosterModal,
}: DowntimeViewProps) {
  const { showToast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(() =>
    getBucharestNowParts().date.slice(0, 7)
  );
  const [windowFilter, setWindowFilter] = useState<"ALL" | MaintenanceWindow>("ALL");
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);

  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<MaintenanceTask | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasksRes, completionsRes] = await Promise.all([
        fetchMaintenanceTasks(),
        fetchCompletions({ month: selectedMonth }),
      ]);
      setTasks(tasksRes);
      setCompletions(completionsRes);

      if (!(selectedMonth in rosterCache)) {
        const r = await fetchRoster(selectedMonth);
        onRosterLoaded(selectedMonth, r);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, rosterCache, onRosterLoaded]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const roster = rosterCache[selectedMonth] ?? null;

  const monthDates = useMemo(() => {
    const parsed = parseMonthKey(selectedMonth);
    if (!parsed) return { MORNING: [] as string[], NIGHT: [] as string[] };
    return getMaintenanceDatesForMonth(parsed.year, parsed.month1Based);
  }, [selectedMonth]);

  const occurrences = useMemo(() => {
    const parsed = parseMonthKey(selectedMonth);
    if (!parsed) return [];
    return generateMaintenanceOccurrencesForMonth({
      year: parsed.year,
      month1Based: parsed.month1Based,
      tasks,
      completions,
      roster,
    });
  }, [selectedMonth, tasks, completions, roster]);

  const morningOccurrences = useMemo(
    () => occurrences.filter((o) => o.window === "MORNING"),
    [occurrences]
  );
  const nightOccurrences = useMemo(
    () => occurrences.filter((o) => o.window === "NIGHT"),
    [occurrences]
  );

  const morningDone = morningOccurrences.filter((o) => o.status === "completed").length;
  const nightDone = nightOccurrences.filter((o) => o.status === "completed").length;

  const handleComplete = async (occ: MaintenanceOccurrence, employee: string) => {
    const key = `${occ.occurrenceId}:${employee}`;
    const optimisticId = `optimistic:${key}:${Date.now()}`;
    const optimisticCompletion: TaskCompletion = {
      id: optimisticId,
      occurrenceId: occ.occurrenceId,
      taskId: occ.taskId,
      taskType: "MAINTENANCE",
      taskTitle: occ.taskTitle,
      scheduledDate: occ.scheduledDate,
      window: occ.window,
      completedBy: employee,
      completedAt: new Date().toISOString(),
    };

    setSubmittingKey(key);
    setCompletions((prev) => [...prev, optimisticCompletion]);

    try {
      const saved = await createCompletion({
        occurrenceId: occ.occurrenceId,
        taskId: occ.taskId,
        taskType: "MAINTENANCE",
        taskTitle: occ.taskTitle,
        scheduledDate: occ.scheduledDate,
        window: occ.window,
        completedBy: employee,
      });
      setCompletions((prev) =>
        prev.map((c) => (c.id === optimisticId ? saved : c))
      );
      showToast({
        tone: "success",
        title: "Maintenance recorded",
        description: `${occ.taskTitle} · ${employee}`,
      });
    } catch (err) {
      setCompletions((prev) => prev.filter((c) => c.id !== optimisticId));
      showToast({
        tone: "error",
        title: "Failed to record completion",
        description: getErrorMessage(err),
      });
      try {
        const updated = await fetchCompletions({ month: selectedMonth });
        setCompletions(updated);
      } catch {
        // ignore
      }
    } finally {
      setSubmittingKey(null);
    }
  };

  const renderWindowSection = (
    windowType: MaintenanceWindow,
    title: string,
    subtitle: string,
    dates: string[]
  ) => {
    const isMorning = windowType === "MORNING";
    const Icon = isMorning ? Sun : Moon;
    const windowOccurrences = isMorning ? morningOccurrences : nightOccurrences;

    const byDate = new Map<string, MaintenanceOccurrence[]>();
    for (const d of dates) byDate.set(d, []);
    for (const occ of windowOccurrences) {
      const list = byDate.get(occ.scheduledDate) ?? [];
      list.push(occ);
      byDate.set(occ.scheduledDate, list);
    }
    const sortedDates = Array.from(byDate.keys()).sort();
    const doneCount = windowOccurrences.filter((o) => o.status === "completed").length;

    return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
          <div className="flex items-center gap-2.5">
            <Icon className="h-4 w-4 text-zinc-400" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
              <p className="text-xs text-zinc-500">{subtitle}</p>
            </div>
          </div>

          <span className="font-mono text-xs tabular-nums text-zinc-400">
            {isMorning ? "Shift M" : "Shift N"} · {doneCount}/{windowOccurrences.length} done
          </span>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {sortedDates.map((dateStr) => {
            const dateOccs = byDate.get(dateStr) ?? [];
            const { weekday, dayNum, monthShort } = formatShortDate(dateStr);

            return (
              <div
                key={dateStr}
                className="grid grid-cols-1 gap-3 py-4 first:pt-1 md:grid-cols-[120px_1fr]"
              >
                {/* Timeline Date Column */}
                <div className="flex items-baseline gap-2 md:flex-col md:gap-0.5 md:pt-0.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-base font-semibold tabular-nums text-zinc-100">
                      {dayNum}
                    </span>
                    <span className="text-xs font-medium text-zinc-400">
                      {monthShort} · {weekday}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-zinc-600">
                    {dateStr}
                  </span>
                </div>

                {/* Tasks for this maintenance date */}
                <div className="divide-y divide-white/[0.06]">
                  {dateOccs.length === 0 ? (
                    <p className="py-2 text-xs text-zinc-500">
                      No enabled {windowType.toLowerCase()} maintenance tasks for this date.
                    </p>
                  ) : (
                    dateOccs.map((occ) => {
                      const completedByMap = new Map(
                        occ.completions.map((c) => [c.completedBy, c.completedAt])
                      );
                      const allEmployees = Array.from(
                        new Set([...occ.eligibleEmployees, ...completedByMap.keys()])
                      );
                      const isDoneOverall = occ.status === "completed";

                      return (
                        <article
                          key={occ.occurrenceId}
                          className="py-3.5 first:pt-0 last:pb-0"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h3 className="text-[15px] font-medium text-zinc-100">
                                {occ.taskTitle}
                              </h3>
                              {occ.taskDescription && (
                                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                                  {occ.taskDescription}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2.5 text-xs">
                              <span className="font-mono tabular-nums text-zinc-500">
                                {occ.completionCount}
                                {occ.eligibleEmployees.length > 0
                                  ? `/${occ.eligibleEmployees.length}`
                                  : ""}{" "}
                                signed
                              </span>
                              <span className="text-zinc-700">·</span>
                              {isDoneOverall ? (
                                <StatusDot tone="emerald">Completed</StatusDot>
                              ) : (
                                <StatusDot tone="neutral">Pending</StatusDot>
                              )}
                            </div>
                          </div>

                          <div className="mt-3">
                            {allEmployees.length === 0 ? (
                              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                                <span>
                                  {roster
                                    ? `No technicians scheduled on ${isMorning ? "M" : "N"} shift on ${dateStr}.`
                                    : "No monthly roster loaded for this month."}
                                </span>
                                {!roster && (
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
                                  {allEmployees.map((emp) => {
                                    const completedAt = completedByMap.get(emp);
                                    const isEmpDone = Boolean(completedAt);
                                    const key = `${occ.occurrenceId}:${emp}`;
                                    const busy = submittingKey === key;

                                    return (
                                      <button
                                        key={emp}
                                        type="button"
                                        disabled={isEmpDone || submittingKey !== null}
                                        title={
                                          completedAt
                                            ? `Completed by ${emp} at ${formatBucharestDateTime(completedAt)}`
                                            : `Mark completed by ${emp}`
                                        }
                                        onClick={() => void handleComplete(occ, emp)}
                                        className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition ${
                                          isEmpDone
                                            ? "cursor-default border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                            : "border-white/[0.08] bg-white/[0.03] text-zinc-200 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300 active:scale-[0.98]"
                                        }`}
                                      >
                                        {busy ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                                        ) : (
                                          <Check
                                            className={`h-3.5 w-3.5 ${
                                              isEmpDone ? "text-emerald-400" : "text-zinc-500"
                                            }`}
                                          />
                                        )}
                                        <span>{emp}</span>
                                        {completedAt && (
                                          <span className="font-mono text-[11px] tabular-nums text-emerald-300/75">
                                            {formatBucharestDateTime(completedAt).slice(11, 16)}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                                <p className="text-[11px] text-zinc-600">
                                  Each technician signs independently
                                </p>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  const morningPct =
    morningOccurrences.length > 0
      ? Math.round((morningDone / morningOccurrences.length) * 100)
      : 0;
  const nightPct =
    nightOccurrences.length > 0
      ? Math.round((nightDone / nightOccurrences.length) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            Downtime Maintenance
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Scheduled monthly maintenance windows · {formatMonthTitle(selectedMonth)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setSelectedMonth((m) => shiftMonthKey(m, -1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                if (e.target.value) setSelectedMonth(e.target.value);
              }}
              className="bg-transparent px-1.5 py-1 font-mono text-xs font-medium tabular-nums text-zinc-100 focus:outline-none sm:text-sm"
            />
            <button
              type="button"
              onClick={() => setSelectedMonth((m) => shiftMonthKey(m, 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <Button variant="ghost" onClick={() => setManageModalOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" />
            <span>Definitions ({tasks.length})</span>
          </Button>

          <Button
            variant="primary"
            onClick={() => {
              setEditingTask(null);
              setFormModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <span>New Task</span>
          </Button>
        </div>
      </div>

      {/* Monthly Window Summary Strip */}
      <div className="grid grid-cols-1 gap-4 border-y border-white/[0.06] py-3.5 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setWindowFilter((w) => (w === "MORNING" ? "ALL" : "MORNING"))}
          className="group space-y-2 text-left transition hover:opacity-90"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
              <Sun className="h-3.5 w-3.5 text-zinc-400" />
              <span>Morning Window (M)</span>
              <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                {monthDates.MORNING.join(" · ")}
              </span>
            </div>
            <span className="font-mono text-xs tabular-nums text-zinc-300">
              {morningDone}/{morningOccurrences.length}
            </span>
          </div>
          <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full bg-zinc-100 transition-all"
              style={{ width: `${morningPct}%` }}
            />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setWindowFilter((w) => (w === "NIGHT" ? "ALL" : "NIGHT"))}
          className="group space-y-2 text-left transition hover:opacity-90"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
              <Moon className="h-3.5 w-3.5 text-zinc-400" />
              <span>Night Window (N)</span>
              <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                {monthDates.NIGHT.join(" · ")}
              </span>
            </div>
            <span className="font-mono text-xs tabular-nums text-zinc-300">
              {nightDone}/{nightOccurrences.length}
            </span>
          </div>
          <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full bg-zinc-100 transition-all"
              style={{ width: `${nightPct}%` }}
            />
          </div>
        </button>
      </div>

      {/* Window Filter Pills */}
      <div className="inline-flex rounded-lg bg-white/[0.04] p-1">
        {(
          [
            { id: "ALL", label: "All Windows" },
            { id: "MORNING", label: "Morning (M)" },
            { id: "NIGHT", label: "Night (N)" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setWindowFilter(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              windowFilter === tab.id
                ? "bg-zinc-100 font-semibold text-zinc-950"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

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
        </div>
      ) : tasks.length === 0 && occurrences.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-5 w-5" />}
          title="No monthly maintenance tasks defined"
          description="Create fixed Morning (1st Mon–Wed) or Night (3rd Mon–Wed) maintenance definitions to populate every month."
          action={
            <Button
              variant="primary"
              onClick={() => {
                setEditingTask(null);
                setFormModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New Maintenance Task
            </Button>
          }
        />
      ) : (
        <div className="space-y-10">
          {(windowFilter === "ALL" || windowFilter === "MORNING") &&
            renderWindowSection(
              "MORNING",
              "Morning Maintenance",
              "First Monday, Tuesday, and Wednesday · M Shift (06:00–14:00)",
              monthDates.MORNING
            )}
          {(windowFilter === "ALL" || windowFilter === "NIGHT") &&
            renderWindowSection(
              "NIGHT",
              "Night Maintenance",
              "Third Monday, Tuesday, and Wednesday · N Shift (22:00–06:00)",
              monthDates.NIGHT
            )}
        </div>
      )}

      {/* Definitions Manager Modal */}
      <Modal
        isOpen={manageModalOpen}
        onClose={() => setManageModalOpen(false)}
        title="Maintenance Definitions"
        subtitle="Fixed tasks reused across every calendar month"
        icon={<Settings2 className="h-4 w-4" />}
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-3">
          {tasks.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-500">
              No maintenance definitions configured yet.
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
                      {task.window === "MORNING"
                        ? "MORNING · M Shift · 1st Mon–Wed"
                        : "NIGHT · N Shift · 3rd Mon–Wed"}
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
              New Maintenance Task
            </Button>
          </div>
        </div>
      </Modal>

      <MaintenanceFormModal
        isOpen={formModalOpen}
        editingTask={editingTask}
        onClose={() => setFormModalOpen(false)}
        onSaved={() => void loadData()}
      />
    </div>
  );
}
