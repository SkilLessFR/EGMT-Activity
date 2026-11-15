import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  Loader2,
  MapPin,
  Moon,
  Plus,
  Sun,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  createCompletion,
  deleteDowntimeSchedule,
  fetchCompletions,
  fetchDowntimeSchedule,
  fetchRoster,
  getErrorMessage,
  saveDowntimeSchedule,
  updateDowntimePhaseTeam,
  updateDowntimeTask,
} from "../api/client";
import {
  buildDowntimeScheduleFromWorkbooks,
  parseDowntimeWorkbook,
  type ParsedDowntimeWorkbook,
} from "../domain/downtimeImporter";
import {
  formatBucharestDateTime,
  formatDisplayDate,
  formatMonthKey,
  formatTimeInterval24h,
  getBucharestNowParts,
  parseMonthKey,
} from "../shared/timezone";
import type {
  DowntimeMonthSchedule,
  DowntimePhase,
  DowntimeTask,
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

function shiftMonthKey(monthKey: string, delta: number): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  const d = new Date(Date.UTC(parsed.year, parsed.month1Based - 1 + delta, 1));
  return formatMonthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
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

function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "UTC",
  }).format(dateObj);
  return `${weekday}, ${formatDisplayDate(isoDate)}`;
}

function buildDowntimeTaskTitle(task: DowntimeTask): string {
  const locPart = task.location ? ` (${task.location})` : "";
  return `P${task.phaseNumber} Studio ${task.studio}${locPart} · ${task.description}`;
}

interface PeopleEditorModalProps {
  isOpen: boolean;
  title: string;
  subtitle: string;
  initialPeople: string[];
  suggestions: string[];
  showApplyToAllToggle?: boolean;
  onClose: () => void;
  onSave: (people: string[], applyToAllTasks: boolean) => Promise<void>;
}

function PeopleEditorModal({
  isOpen,
  title,
  subtitle,
  initialPeople,
  suggestions,
  showApplyToAllToggle = false,
  onClose,
  onSave,
}: PeopleEditorModalProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [customName, setCustomName] = useState("");
  const [applyToAll, setApplyToAll] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(initialPeople);
    setCustomName("");
    setApplyToAll(true);
  }, [isOpen, initialPeople]);

  const allChoices = useMemo(() => {
    const map = new Map<string, string>();
    for (const name of [...initialPeople, ...suggestions]) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!map.has(key)) map.set(key, trimmed);
    }
    return Array.from(map.values());
  }, [initialPeople, suggestions]);

  const isSelected = (name: string) =>
    selected.some((p) => p.toLowerCase() === name.toLowerCase());

  const togglePerson = (name: string) => {
    setSelected((prev) =>
      prev.some((p) => p.toLowerCase() === name.toLowerCase())
        ? prev.filter((p) => p.toLowerCase() !== name.toLowerCase())
        : [...prev, name]
    );
  };

  const handleAddCustom = () => {
    const trimmed = customName.trim();
    if (!trimmed) return;
    if (!isSelected(trimmed)) {
      setSelected((prev) => [...prev, trimmed]);
    }
    setCustomName("");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(selected, applyToAll);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon={<Users className="h-4 w-4" />}
      maxWidthClass="max-w-lg"
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddCustom();
              }
            }}
            placeholder="Add person name (e.g. Bogdan, Alex U.)..."
            className={inputClassName}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={handleAddCustom}
            disabled={!customName.trim()}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-zinc-400">
            Selected ({selected.length})
          </p>
          {selected.length === 0 ? (
            <p className="text-xs text-zinc-500">No people assigned yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((person) => (
                <span
                  key={person}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200"
                >
                  {person}
                  <button
                    type="button"
                    onClick={() => togglePerson(person)}
                    className="rounded p-0.5 text-emerald-300/70 hover:bg-emerald-500/20 hover:text-emerald-100"
                    aria-label={`Remove ${person}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {allChoices.length > 0 && (
          <div className="space-y-1.5 border-t border-white/[0.06] pt-3">
            <p className="text-xs font-medium text-zinc-400">
              Team & Roster Suggestions
            </p>
            <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
              {allChoices.map((choice) => {
                const active = isSelected(choice);
                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => togglePerson(choice)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                        : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:border-white/[0.2] hover:text-zinc-100"
                    }`}
                  >
                    {active && <Check className="h-3 w-3 text-emerald-400" />}
                    <span>{choice}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {showApplyToAllToggle && (
          <label className="flex items-center gap-2.5 border-t border-white/[0.06] pt-3 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-zinc-900 accent-zinc-100"
            />
            <span>Apply this team to all tasks in this phase</span>
          </label>
        )}

        <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save People
          </Button>
        </div>
      </div>
    </Modal>
  );
}

interface DowntimeImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: (schedule: DowntimeMonthSchedule) => void;
}

function DowntimeImportModal({
  isOpen,
  onClose,
  onImported,
}: DowntimeImportModalProps) {
  const { showToast } = useToast();
  const [parsedFiles, setParsedFiles] = useState<ParsedDowntimeWorkbook[]>([]);
  const [includePassRows, setIncludePassRows] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setParsedFiles([]);
    setIncludePassRows(false);
    setError(null);
  }, [isOpen]);

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setParsing(true);
    setError(null);
    try {
      const incoming: ParsedDowntimeWorkbook[] = [];
      for (const file of Array.from(fileList)) {
        const buffer = await file.arrayBuffer();
        const parsed = await parseDowntimeWorkbook(buffer, file.name);
        incoming.push(parsed);
      }
      setParsedFiles((prev) => {
        const byName = new Map(prev.map((p) => [p.fileName, p]));
        for (const item of incoming) {
          byName.set(item.fileName, item);
        }
        return Array.from(byName.values());
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setParsing(false);
    }
  };

  const preview = useMemo(() => {
    if (parsedFiles.length === 0) return null;
    try {
      return buildDowntimeScheduleFromWorkbooks(parsedFiles, {
        includePassRows,
      });
    } catch {
      return null;
    }
  }, [parsedFiles, includePassRows]);

  const handleImport = async () => {
    if (!preview) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveDowntimeSchedule(preview.schedule);
      showToast({
        tone: "success",
        title: "Downtime schedule imported",
        description: `${saved.phases.length} phases · ${saved.tasks.length} tasks for ${saved.monthKey}`,
      });
      onImported(saved);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Import Downtime Excel"
      subtitle="Upload 1 or 2 Excel files (e.g. Phase 1–4 and Phase 5–8) for the month"
      icon={<FileSpreadsheet className="h-4 w-4" />}
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.14] bg-white/[0.02] px-4 py-6 text-center transition hover:border-white/[0.28] hover:bg-white/[0.04]">
          {parsing ? (
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          ) : (
            <Upload className="h-6 w-6 text-zinc-400" />
          )}
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-zinc-100">
              Select 1 or 2 Downtime Excel files (.xlsx)
            </p>
            <p className="text-xs text-zinc-500">
              You can select both files at once or add the second file after
            </p>
          </div>
          <input
            type="file"
            accept=".xlsx,.xlsm"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFilesSelected(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {parsedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-400">
              Loaded Files ({parsedFiles.length})
            </p>
            <div className="space-y-1.5">
              {parsedFiles.map((file) => (
                <div
                  key={file.fileName}
                  className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-200">
                      {file.fileName}
                    </p>
                    <p className="text-zinc-500">
                      {file.sheets.length} phase sheets · Month {file.monthKey}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setParsedFiles((prev) =>
                        prev.filter((p) => p.fileName !== file.fileName)
                      )
                    }
                    className="rounded p-1 text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100"
                    aria-label={`Remove ${file.fileName}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <label className="flex items-center gap-2.5 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={includePassRows}
            onChange={(e) => setIncludePassRows(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-zinc-900 accent-zinc-100"
          />
          <span>
            Include &ldquo;Pass&rdquo; studio rows as tasks (skipped by default)
          </span>
        </label>

        {preview && (
          <div className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
              <span className="text-xs font-semibold text-zinc-100">
                Preview · {formatMonthTitle(preview.schedule.monthKey)}
              </span>
              <span className="font-mono text-xs tabular-nums text-zinc-400">
                {preview.schedule.phases.length} phases ·{" "}
                {preview.schedule.tasks.length} tasks
                {preview.skippedPassCount > 0 &&
                  ` · ${preview.skippedPassCount} Pass skipped`}
              </span>
            </div>

            <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {preview.schedule.phases.map((phase) => {
                const count = preview.schedule.tasks.filter(
                  (t) => t.phaseNumber === phase.phaseNumber
                ).length;
                return (
                  <div
                    key={phase.phaseNumber}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.02] px-2.5 py-1.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-zinc-100">
                        P{phase.phaseNumber}
                      </span>
                      <span className="font-mono text-zinc-400">
                        {formatDisplayDate(phase.scheduledDate)}
                        {phase.endDate
                          ? ` → ${formatDisplayDate(phase.endDate)}`
                          : ""}
                      </span>
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-300">
                        {phase.shiftLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-zinc-400">
                      <span className="truncate max-w-[180px]">
                        {phase.defaultTeam.join(", ") || "No team"}
                      </span>
                      <span className="font-mono text-zinc-300">
                        {count} tasks
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-white/[0.06] pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!preview || saving}
            onClick={() => void handleImport()}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Import Schedule
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function DowntimeView({
  rosterCache,
  onRosterLoaded,
}: DowntimeViewProps) {
  const { showToast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState(() =>
    getBucharestNowParts().date.slice(0, 7)
  );
  const [schedule, setSchedule] = useState<DowntimeMonthSchedule | null>(null);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [phaseFilter, setPhaseFilter] = useState<number | "ALL">("ALL");
  const [windowFilter, setWindowFilter] = useState<"ALL" | MaintenanceWindow>(
    "ALL"
  );
  const [locationFilter, setLocationFilter] = useState<string>("ALL");
  const [personFilter, setPersonFilter] = useState<string>("ALL");

  // Selection map for multi-person completion per task: taskId -> Set<person>
  const [selectedPeopleByTask, setSelectedPeopleByTask] = useState<
    Record<string, string[]>
  >({});
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const [editingTaskPeople, setEditingTaskPeople] =
    useState<DowntimeTask | null>(null);
  const [editingPhaseTeam, setEditingPhaseTeam] =
    useState<DowntimePhase | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scheduleRes, completionsRes] = await Promise.all([
        fetchDowntimeSchedule(selectedMonth),
        fetchCompletions({ month: selectedMonth }),
      ]);
      setSchedule(scheduleRes);
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

  // Reset filters when switching months
  useEffect(() => {
    setPhaseFilter("ALL");
    setWindowFilter("ALL");
    setLocationFilter("ALL");
    setPersonFilter("ALL");
    setSelectedPeopleByTask({});
  }, [selectedMonth]);

  const roster = rosterCache[selectedMonth] ?? null;

  const completionsByTaskId = useMemo(() => {
    const map = new Map<string, TaskCompletion[]>();
    for (const c of completions) {
      if (c.taskType !== "MAINTENANCE") continue;
      const list = map.get(c.taskId) ?? [];
      list.push(c);
      map.set(c.taskId, list);
    }
    return map;
  }, [completions]);

  const allPeopleSuggestions = useMemo(() => {
    const set = new Set<string>();
    if (roster) {
      for (const emp of roster.employees) set.add(emp);
    }
    if (schedule) {
      for (const p of schedule.phases) {
        for (const name of p.defaultTeam) set.add(name);
      }
      for (const t of schedule.tasks) {
        for (const name of t.assignedPeople) set.add(name);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [roster, schedule]);

  const allLocations = useMemo(() => {
    if (!schedule) return [];
    const set = new Set<string>();
    for (const t of schedule.tasks) {
      if (t.location) set.add(t.location);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [schedule]);

  const filteredPhases = useMemo(() => {
    if (!schedule) return [];
    return schedule.phases.filter((p) => {
      if (phaseFilter !== "ALL" && p.phaseNumber !== phaseFilter) return false;
      if (windowFilter !== "ALL" && p.window !== windowFilter) return false;
      return true;
    });
  }, [schedule, phaseFilter, windowFilter]);

  const totalTasks = schedule?.tasks.length ?? 0;
  const completedTasksCount = useMemo(() => {
    if (!schedule) return 0;
    return schedule.tasks.filter(
      (t) => (completionsByTaskId.get(t.id)?.length ?? 0) > 0
    ).length;
  }, [schedule, completionsByTaskId]);

  const togglePersonSelection = (taskId: string, person: string) => {
    setSelectedPeopleByTask((prev) => {
      const current = prev[taskId] ?? [];
      const exists = current.some(
        (p) => p.toLowerCase() === person.toLowerCase()
      );
      const next = exists
        ? current.filter((p) => p.toLowerCase() !== person.toLowerCase())
        : [...current, person];
      return { ...prev, [taskId]: next };
    });
  };

  const handleCompleteForPeople = async (
    task: DowntimeTask,
    people: string[]
  ) => {
    if (people.length === 0) return;
    setCompletingTaskId(task.id);
    const taskTitle = buildDowntimeTaskTitle(task);
    const optimisticIds: string[] = [];
    const nowIso = new Date().toISOString();

    const optimisticItems: TaskCompletion[] = people.map((person, idx) => {
      const optId = `optimistic:${task.id}:${person}:${Date.now()}:${idx}`;
      optimisticIds.push(optId);
      return {
        id: optId,
        occurrenceId: task.id,
        taskId: task.id,
        taskType: "MAINTENANCE",
        taskTitle,
        scheduledDate: task.scheduledDate,
        window: task.window,
        completedBy: person,
        completedAt: nowIso,
      };
    });

    setCompletions((prev) => [...prev, ...optimisticItems]);

    try {
      const savedList = await Promise.all(
        people.map((person) =>
          createCompletion({
            occurrenceId: task.id,
            taskId: task.id,
            taskType: "MAINTENANCE",
            taskTitle,
            scheduledDate: task.scheduledDate,
            window: task.window,
            completedBy: person,
          })
        )
      );

      setCompletions((prev) => {
        const withoutOpt = prev.filter((c) => !optimisticIds.includes(c.id));
        return [...withoutOpt, ...savedList];
      });
      setSelectedPeopleByTask((prev) => ({ ...prev, [task.id]: [] }));
      showToast({
        tone: "success",
        title: "Downtime task completed",
        description: `Studio ${task.studio} · ${people.join(", ")}`,
      });
    } catch (err) {
      setCompletions((prev) =>
        prev.filter((c) => !optimisticIds.includes(c.id))
      );
      showToast({
        tone: "error",
        title: "Failed to record completion",
        description: getErrorMessage(err),
      });
    } finally {
      setCompletingTaskId(null);
    }
  };

  const handleClearMonth = async () => {
    setClearing(true);
    try {
      await deleteDowntimeSchedule(selectedMonth);
      setSchedule(null);
      setConfirmClearOpen(false);
      showToast({
        tone: "success",
        title: "Month schedule cleared",
        description: `Uploaded schedule removed for ${selectedMonth}. Completion history is preserved.`,
      });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Failed to clear schedule",
        description: getErrorMessage(err),
      });
    } finally {
      setClearing(false);
    }
  };

  const overallPct =
    totalTasks > 0 ? Math.round((completedTasksCount / totalTasks) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            Downtime Maintenance
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {schedule
              ? `${formatMonthTitle(selectedMonth)} · ${schedule.phases.length} phases · ${schedule.tasks.length} studio tasks`
              : `No schedule uploaded for ${formatMonthTitle(selectedMonth)}`}
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

          {schedule && (
            <Button
              variant="ghost"
              onClick={() => setConfirmClearOpen(true)}
              title="Clear this month's schedule (history stays saved)"
            >
              <Trash2 className="h-3.5 w-3.5 text-zinc-400" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          )}

          <Button variant="primary" onClick={() => setImportModalOpen(true)}>
            <Upload className="h-4 w-4" />
            <span>Import Excel</span>
          </Button>
        </div>
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
      ) : !schedule ? (
        <EmptyState
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title={`No downtime schedule for ${formatMonthTitle(selectedMonth)}`}
          description="Upload the 2 monthly Downtime Excel files (Phases 1–4 and Phases 5–8) to generate this month's studio tasks. Past completion history is always preserved."
          action={
            <Button variant="primary" onClick={() => setImportModalOpen(true)}>
              <Upload className="h-4 w-4" />
              Import Downtime Excel
            </Button>
          }
        />
      ) : (
        <>
          {/* Progress Bar */}
          <div className="space-y-2 border-y border-white/[0.06] py-3.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-zinc-300">
                Monthly Downtime Progress
              </span>
              <span className="font-mono tabular-nums text-zinc-200">
                {completedTasksCount}/{totalTasks} studios ({overallPct}%)
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full bg-emerald-400 transition-all"
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Phase Pills */}
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-white/[0.04] p-1">
              <button
                type="button"
                onClick={() => setPhaseFilter("ALL")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  phaseFilter === "ALL"
                    ? "btn-primary-theme font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                All Phases
              </button>
              {schedule.phases.map((p) => (
                <button
                  key={p.phaseNumber}
                  type="button"
                  onClick={() => setPhaseFilter(p.phaseNumber)}
                  className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium transition ${
                    phaseFilter === p.phaseNumber
                      ? "btn-primary-theme font-semibold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  P{p.phaseNumber}
                </button>
              ))}
            </div>

            {/* Shift Filter */}
            <div className="inline-flex rounded-lg bg-white/[0.04] p-1">
              {(
                [
                  { id: "ALL", label: "All Shifts" },
                  { id: "MORNING", label: "Day" },
                  { id: "NIGHT", label: "Night" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setWindowFilter(item.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    windowFilter === item.id
                    ? "btn-primary-theme font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Location Filter */}
            {allLocations.length > 0 && (
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="h-8 rounded-lg border border-white/[0.08] bg-surface-input px-2.5 text-xs text-zinc-100 focus:border-white/[0.25] focus:outline-none"
                aria-label="Filter by location"
              >
                <option value="ALL">All Locations</option>
                {allLocations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            )}

            {/* Person Filter */}
            {allPeopleSuggestions.length > 0 && (
              <select
                value={personFilter}
                onChange={(e) => setPersonFilter(e.target.value)}
                className="h-8 rounded-lg border border-white/[0.08] bg-surface-input px-2.5 text-xs text-zinc-100 focus:border-white/[0.25] focus:outline-none"
                aria-label="Filter by person"
              >
                <option value="ALL">All People</option>
                {allPeopleSuggestions.map((person) => (
                  <option key={person} value={person}>
                    {person}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Phase Sections */}
          <div className="space-y-8">
            {filteredPhases.map((phase) => {
              const phaseTasks = schedule.tasks.filter((t) => {
                if (t.phaseNumber !== phase.phaseNumber) return false;
                if (
                  locationFilter !== "ALL" &&
                  t.location !== locationFilter
                ) {
                  return false;
                }
                if (
                  personFilter !== "ALL" &&
                  !t.assignedPeople.some(
                    (p) => p.toLowerCase() === personFilter.toLowerCase()
                  )
                ) {
                  return false;
                }
                return true;
              });

              const doneInPhase = phaseTasks.filter(
                (t) => (completionsByTaskId.get(t.id)?.length ?? 0) > 0
              ).length;
              const isMorning = phase.window === "MORNING";
              const ShiftIcon = isMorning ? Sun : Moon;

              return (
                <section key={phase.phaseNumber} className="space-y-3">
                  {/* Phase Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="btn-primary-theme rounded-md px-2 py-0.5 font-mono text-xs font-bold">
                        PHASE {phase.phaseNumber}
                      </span>
                      <span className="text-sm font-semibold text-zinc-100">
                        {formatShortDate(phase.scheduledDate)}
                        {phase.endDate
                          ? ` → ${formatShortDate(phase.endDate)}`
                          : ""}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-xs text-zinc-300">
                        <ShiftIcon className="h-3 w-3 text-zinc-400" />
                        {phase.shiftLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingPhaseTeam(phase)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-300 transition hover:border-white/[0.2] hover:text-zinc-100"
                      >
                        <Users className="h-3.5 w-3.5 text-zinc-400" />
                        <span>
                          {phase.defaultTeam.length > 0
                            ? phase.defaultTeam.join(", ")
                            : "Set Team"}
                        </span>
                      </button>
                      <span className="font-mono text-xs tabular-nums text-zinc-400">
                        {doneInPhase}/{phaseTasks.length}
                      </span>
                    </div>
                  </div>

                  {/* Phase Notice Banners */}
                  {phase.notices.length > 0 && (
                    <div className="space-y-1.5">
                      {phase.notices.map((notice) => (
                        <div
                          key={notice}
                          className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                        >
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                          <span>{notice}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tasks List */}
                  {phaseTasks.length === 0 ? (
                    <p className="py-3 text-xs text-zinc-500">
                      No studio tasks match the current filters in Phase{" "}
                      {phase.phaseNumber}.
                    </p>
                  ) : (
                    <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-white/[0.015]">
                      {phaseTasks.map((task) => {
                        const taskCompletions =
                          completionsByTaskId.get(task.id) ?? [];
                        const completedByMap = new Map(
                          taskCompletions.map((c) => [
                            c.completedBy.toLowerCase(),
                            c,
                          ])
                        );
                        const allTaskPeople = Array.from(
                          new Set([
                            ...task.assignedPeople,
                            ...taskCompletions.map((c) => c.completedBy),
                          ])
                        );
                        const pendingPeople = allTaskPeople.filter(
                          (p) => !completedByMap.has(p.toLowerCase())
                        );
                        const selectedForTask =
                          selectedPeopleByTask[task.id] ?? [];
                        const isBusy = completingTaskId === task.id;
                        const isDone = taskCompletions.length > 0;

                        return (
                          <article key={task.id} className="space-y-3 p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-sm font-semibold text-zinc-100">
                                    Studio {task.studio}
                                  </h3>
                                  {task.location && (
                                    <span className="inline-flex items-center gap-1 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
                                      <MapPin className="h-3 w-3 text-zinc-400" />
                                      {task.location}
                                    </span>
                                  )}
                                  {task.accessInterval && (
                                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-400">
                                      <Clock className="h-3 w-3" />
                                      {formatTimeInterval24h(
                                        task.accessInterval
                                      )}
                                    </span>
                                  )}
                                  {task.idealTimeMin !== undefined && (
                                    <span className="font-mono text-[11px] text-zinc-500">
                                      {task.idealTimeMin}m
                                    </span>
                                  )}
                                  {task.tablesCount !== undefined && (
                                    <span className="font-mono text-[11px] text-zinc-500">
                                      {task.tablesCount}{" "}
                                      {task.tablesCount === 1
                                        ? "table"
                                        : "tables"}
                                    </span>
                                  )}
                                  {task.sectionNote && (
                                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-300">
                                      {task.sectionNote}
                                    </span>
                                  )}
                                  {task.isPass && (
                                    <span className="rounded bg-zinc-500/20 px-1.5 py-0.5 text-[11px] text-zinc-400">
                                      Pass
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs leading-relaxed text-zinc-300">
                                  {task.description}
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                {isDone ? (
                                  <StatusDot tone="emerald">
                                    Completed ({taskCompletions.length})
                                  </StatusDot>
                                ) : (
                                  <StatusDot tone="neutral">Pending</StatusDot>
                                )}
                              </div>
                            </div>

                            {/* People Assignment & Multi-Person Completion */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {allTaskPeople.map((person) => {
                                  const comp = completedByMap.get(
                                    person.toLowerCase()
                                  );
                                  if (comp) {
                                    return (
                                      <span
                                        key={person}
                                        title={`Completed by ${comp.completedBy} at ${formatBucharestDateTime(comp.completedAt)}`}
                                        className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300"
                                      >
                                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                                        <span>{comp.completedBy}</span>
                                        <span className="font-mono text-[10px] text-emerald-300/75">
                                          {formatBucharestDateTime(
                                            comp.completedAt
                                          ).slice(11, 16)}
                                        </span>
                                      </span>
                                    );
                                  }

                                  const isChecked = selectedForTask.some(
                                    (s) =>
                                      s.toLowerCase() === person.toLowerCase()
                                  );
                                  return (
                                    <button
                                      key={person}
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() =>
                                        togglePersonSelection(task.id, person)
                                      }
                                      className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                                        isChecked
                                          ? "btn-primary-theme border-transparent"
                                          : "border-white/[0.1] bg-white/[0.03] text-zinc-300 hover:border-white/[0.25] hover:text-zinc-100"
                                      }`}
                                    >
                                      <span
                                        className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${
                                          isChecked
                                            ? "border-zinc-950 bg-zinc-950 text-zinc-100"
                                            : "border-zinc-500"
                                        }`}
                                      >
                                        {isChecked && (
                                          <Check className="h-2.5 w-2.5" />
                                        )}
                                      </span>
                                      <span>{person}</span>
                                    </button>
                                  );
                                })}

                                <button
                                  type="button"
                                  onClick={() => setEditingTaskPeople(task)}
                                  className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-dashed border-white/[0.14] px-2.5 py-1 text-xs text-zinc-400 transition hover:border-white/[0.3] hover:text-zinc-100"
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                  <span>People</span>
                                </button>
                              </div>

                              {/* Complete Action Buttons */}
                              {pendingPeople.length > 0 && (
                                <div className="flex items-center gap-1.5">
                                  {selectedForTask.length > 0 ? (
                                    <Button
                                      type="button"
                                      variant="primary"
                                      disabled={isBusy}
                                      onClick={() =>
                                        void handleCompleteForPeople(
                                          task,
                                          selectedForTask
                                        )
                                      }
                                    >
                                      {isBusy ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <CheckCheck className="h-3.5 w-3.5" />
                                      )}
                                      <span>
                                        Complete ({selectedForTask.length})
                                      </span>
                                    </Button>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      disabled={isBusy}
                                      onClick={() =>
                                        void handleCompleteForPeople(
                                          task,
                                          pendingPeople
                                        )
                                      }
                                    >
                                      {isBusy ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <CheckCheck className="h-3.5 w-3.5" />
                                      )}
                                      <span>
                                        Complete All ({pendingPeople.length})
                                      </span>
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {/* Excel Import Modal */}
      <DowntimeImportModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImported={(imported) => {
          if (imported.monthKey !== selectedMonth) {
            setSelectedMonth(imported.monthKey);
          } else {
            setSchedule(imported);
          }
        }}
      />

      {/* Edit Task People Modal */}
      <PeopleEditorModal
        isOpen={Boolean(editingTaskPeople)}
        title={
          editingTaskPeople
            ? `Assign People · Studio ${editingTaskPeople.studio}`
            : "Assign People"
        }
        subtitle={
          editingTaskPeople
            ? `Phase ${editingTaskPeople.phaseNumber} · ${editingTaskPeople.description}`
            : ""
        }
        initialPeople={editingTaskPeople?.assignedPeople ?? []}
        suggestions={allPeopleSuggestions}
        onClose={() => setEditingTaskPeople(null)}
        onSave={async (people) => {
          if (!editingTaskPeople || !schedule) return;
          const updated = await updateDowntimeTask({
            monthKey: schedule.monthKey,
            taskId: editingTaskPeople.id,
            assignedPeople: people,
          });
          setSchedule(updated);
          showToast({
            tone: "success",
            title: "Task team updated",
            description: `Studio ${editingTaskPeople.studio} · ${people.length} assigned`,
          });
        }}
      />

      {/* Edit Phase Team Modal */}
      <PeopleEditorModal
        isOpen={Boolean(editingPhaseTeam)}
        title={
          editingPhaseTeam
            ? `Phase ${editingPhaseTeam.phaseNumber} Team`
            : "Phase Team"
        }
        subtitle={
          editingPhaseTeam
            ? `${formatDisplayDate(editingPhaseTeam.scheduledDate)} · ${editingPhaseTeam.shiftLabel}`
            : ""
        }
        initialPeople={editingPhaseTeam?.defaultTeam ?? []}
        suggestions={allPeopleSuggestions}
        showApplyToAllToggle
        onClose={() => setEditingPhaseTeam(null)}
        onSave={async (people, applyToAllTasks) => {
          if (!editingPhaseTeam || !schedule) return;
          const updated = await updateDowntimePhaseTeam({
            monthKey: schedule.monthKey,
            phaseNumber: editingPhaseTeam.phaseNumber,
            defaultTeam: people,
            applyToAllTasks,
          });
          setSchedule(updated);
          showToast({
            tone: "success",
            title: `Phase ${editingPhaseTeam.phaseNumber} team updated`,
            description: applyToAllTasks
              ? "Applied to all tasks in this phase"
              : "Updated phase default team",
          });
        }}
      />

      {/* Confirm Clear Month */}
      <ConfirmDialog
        isOpen={confirmClearOpen}
        title="Clear month schedule?"
        description={`This removes the uploaded Downtime schedule for ${formatMonthTitle(selectedMonth)} so you can re-upload. All completion history remains saved.`}
        confirmLabel="Clear Schedule"
        busy={clearing}
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={() => void handleClearMonth()}
      />
    </div>
  );
}
