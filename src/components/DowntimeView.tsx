import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
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
  X,
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [windowVal, setWindowVal] = useState<MaintenanceWindow>("MORNING");
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
      setWindowVal(editingTask.window);
      setEnabled(editingTask.enabled);
    } else {
      setTitle("");
      setDescription("");
      setWindowVal("MORNING");
      setEnabled(true);
    }
  }, [isOpen, editingTask]);

  if (!isOpen) return null;

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
      } else {
        await createMaintenanceTask(payload);
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
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-100">
            {editingTask ? "Edit Maintenance Task" : "New Maintenance Task"}
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
              placeholder="e.g. Conveyor belt tension & alignment"
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
              placeholder="Procedure details..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Maintenance Window
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWindowVal("MORNING")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition ${
                  windowVal === "MORNING"
                    ? "border-amber-400 bg-amber-500/15 text-amber-300"
                    : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600"
                }`}
              >
                <Sun className="h-4 w-4" />
                <span>Morning (M · 1st M/T/W)</span>
              </button>
              <button
                type="button"
                onClick={() => setWindowVal("NIGHT")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition ${
                  windowVal === "NIGHT"
                    ? "border-amber-400 bg-amber-500/15 text-amber-300"
                    : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600"
                }`}
              >
                <Moon className="h-4 w-4" />
                <span>Night (N · 3rd M/T/W)</span>
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

function shiftMonthKey(monthKey: string, delta: number): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  let totalMonths = parsed.year * 12 + (parsed.month1Based - 1) + delta;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth1 = (totalMonths % 12) + 1;
  return formatMonthKey(newYear, newMonth1);
}

export function DowntimeView({
  rosterCache,
  onRosterLoaded,
  onOpenRosterModal,
}: DowntimeViewProps) {
  const [selectedMonth, setSelectedMonth] = useState(() =>
    getBucharestNowParts().date.slice(0, 7)
  );
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showDefinitions, setShowDefinitions] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
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

  const parsedMonth = parseMonthKey(selectedMonth);
  const roster = rosterCache[selectedMonth] ?? null;

  const monthDates = useMemo(() => {
    if (!parsedMonth) return { MORNING: [], NIGHT: [] };
    return getMaintenanceDatesForMonth(parsedMonth.year, parsedMonth.month1Based);
  }, [parsedMonth]);

  const occurrences = useMemo(() => {
    if (!parsedMonth) return [];
    return generateMaintenanceOccurrencesForMonth({
      year: parsedMonth.year,
      month1Based: parsedMonth.month1Based,
      tasks,
      completions,
      roster,
    });
  }, [parsedMonth, tasks, completions, roster]);

  const handleComplete = async (occ: MaintenanceOccurrence, employee: string) => {
    const key = `${occ.occurrenceId}:${employee}`;
    setSubmittingKey(key);
    setActionError(null);
    try {
      await createCompletion({
        occurrenceId: occ.occurrenceId,
        taskId: occ.taskId,
        taskType: "MAINTENANCE",
        taskTitle: occ.taskTitle,
        scheduledDate: occ.scheduledDate,
        window: occ.window,
        completedBy: employee,
      });
      const updated = await fetchCompletions({ month: selectedMonth });
      setCompletions(updated);
    } catch (err) {
      setActionError(getErrorMessage(err));
      try {
        const updated = await fetchCompletions({ month: selectedMonth });
        setCompletions(updated);
      } catch {
        // ignore secondary error
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
    const WindowIcon = windowType === "MORNING" ? Sun : Moon;
    const windowOccurrences = occurrences.filter((o) => o.window === windowType);

    return (
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300">
              <WindowIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
              <p className="text-xs text-slate-400">{subtitle}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 font-mono text-xs">
            {dates.map((d) => (
              <span
                key={d}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-300"
              >
                {d}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {dates.map((dateStr) => {
            const dateOccurrences = windowOccurrences.filter(
              (o) => o.scheduledDate === dateStr
            );

            return (
              <div
                key={dateStr}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"
              >
                <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <span className="font-mono text-sm font-semibold text-amber-300">
                    {dateStr}
                  </span>
                  <span className="text-xs text-slate-400">
                    {dateOccurrences.length} task{dateOccurrences.length === 1 ? "" : "s"}
                  </span>
                </div>

                {dateOccurrences.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No maintenance tasks configured for this window.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {dateOccurrences.map((occ) => {
                      const completedBySet = new Set(
                        occ.completions.map((c) => c.completedBy)
                      );
                      const allEmployees = Array.from(
                        new Set([
                          ...occ.eligibleEmployees,
                          ...occ.completions.map((c) => c.completedBy),
                        ])
                      );

                      return (
                        <div
                          key={occ.occurrenceId}
                          className={`rounded-lg border p-3.5 ${
                            occ.status === "completed"
                              ? "border-emerald-500/30 bg-emerald-950/15"
                              : "border-slate-800 bg-slate-950/50"
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-semibold text-slate-100">
                                {occ.taskTitle}
                              </h3>
                              {occ.taskDescription && (
                                <p className="mt-0.5 text-xs text-slate-400">
                                  {occ.taskDescription}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300">
                                {occ.completionCount}
                                {occ.eligibleEmployees.length > 0
                                  ? ` / ${occ.eligibleEmployees.length}`
                                  : ""}{" "}
                                done
                              </span>
                              {occ.status === "completed" ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Completed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
                                  <Clock className="h-3.5 w-3.5" />
                                  Pending
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 border-t border-slate-800/80 pt-3">
                            {allEmployees.length === 0 ? (
                              <div className="text-xs text-slate-400">
                                {roster
                                  ? `No employees scheduled on ${windowType === "MORNING" ? "M" : "N"} shift on ${dateStr}.`
                                  : "No roster loaded for this month."}{" "}
                                {!roster && (
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
                              <div className="flex flex-wrap gap-2">
                                {allEmployees.map((emp) => {
                                  const isDone = completedBySet.has(emp);
                                  const key = `${occ.occurrenceId}:${emp}`;
                                  const busy = submittingKey === key;
                                  return (
                                    <button
                                      key={emp}
                                      type="button"
                                      disabled={isDone || submittingKey !== null}
                                      onClick={() => void handleComplete(occ, emp)}
                                      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                                        isDone
                                          ? "cursor-default border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                          : "border-slate-700 bg-slate-800 text-slate-100 hover:border-emerald-500/50 hover:bg-emerald-500/15 hover:text-emerald-200 active:scale-[0.98]"
                                      } disabled:opacity-90`}
                                    >
                                      {busy ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : isDone ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                      ) : null}
                                      <span>{emp}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
            onClick={() => setSelectedMonth((m) => shiftMonthKey(m, -1))}
            className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-slate-300 hover:bg-slate-800"
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
            className="min-h-[38px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
          />

          <button
            type="button"
            onClick={() => setSelectedMonth((m) => shiftMonthKey(m, 1))}
            className="inline-flex min-h-[38px] items-center justify-center rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-slate-300 hover:bg-slate-800"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowDefinitions((prev) => !prev)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span>Manage Definitions ({tasks.length})</span>
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
            <span>New Maintenance Task</span>
          </button>
        </div>
      </div>

      {/* Definitions Drawer */}
      {showDefinitions && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">
              Fixed Maintenance Task Definitions
            </h2>
            <button
              type="button"
              onClick={() => setShowDefinitions(false)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Close
            </button>
          </div>
          {tasks.length === 0 ? (
            <p className="text-xs text-slate-400">No maintenance tasks configured yet.</p>
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
                      {task.window === "MORNING"
                        ? "MORNING (M · 1st M/T/W)"
                        : "NIGHT (N · 3rd M/T/W)"}
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
          Loading downtime schedule...
        </div>
      ) : (
        <div className="space-y-8">
          {renderWindowSection(
            "MORNING",
            "Morning Maintenance (M-Shift)",
            "First Monday, Tuesday, and Wednesday of the month · 06:00–14:00",
            monthDates.MORNING
          )}
          {renderWindowSection(
            "NIGHT",
            "Night Maintenance (N-Shift)",
            "Third Monday, Tuesday, and Wednesday of the month · 22:00–06:00",
            monthDates.NIGHT
          )}
        </div>
      )}

      <MaintenanceFormModal
        isOpen={modalOpen}
        editingTask={editingTask}
        onClose={() => setModalOpen(false)}
        onSaved={() => void loadData()}
      />
    </div>
  );
}
