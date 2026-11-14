import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  History,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  downloadHistoryExport,
  fetchHistory,
  getErrorMessage,
} from "../api/client";
import { formatBucharestDateTime, getBucharestDate } from "../shared/timezone";
import type { HistoryCategory, HistoryItem, RosterData } from "../shared/types";
import {
  Button,
  EmptyState,
  SkeletonCard,
  StatusBadge,
  inputClassName,
  selectClassName,
} from "./ui/Primitives";
import { useToast } from "./ui/Toast";

interface HistoryViewProps {
  roster: RosterData | null;
}

function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function HistoryView({ roster }: HistoryViewProps) {
  const { showToast } = useToast();
  const today = useMemo(() => getBucharestDate(), []);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [fromDate, setFromDate] = useState(monthStart);
  const [toDate, setToDate] = useState(today);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [category, setCategory] = useState<HistoryCategory>("ALL");

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportingType, setExportingType] = useState<"daily" | "downtime" | null>(null);

  const loadHistory = useCallback(async () => {
    if (!fromDate || !toDate) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHistory({
        from: fromDate,
        to: toDate,
        employee: employeeFilter || undefined,
        task: taskSearch.trim() || undefined,
        category,
      });
      setItems(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, employeeFilter, taskSearch, category]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const employeeOptions = useMemo(() => {
    const names = new Set<string>();
    if (roster) {
      for (const emp of roster.employees) names.add(emp);
    }
    for (const item of items) {
      if (item.completedBy) names.add(item.completedBy);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [roster, items]);

  const handleExport = async (type: "daily" | "downtime") => {
    setExportingType(type);
    try {
      await downloadHistoryExport({ type, from: fromDate, to: toDate });
      showToast({
        tone: "success",
        title: type === "daily" ? "Daily Tasks exported" : "Downtime exported",
        description: `${fromDate} to ${toDate} (.xlsx)`,
      });
    } catch (err) {
      showToast({
        tone: "error",
        title: "Excel export failed",
        description: getErrorMessage(err),
      });
    } finally {
      setExportingType(null);
    }
  };

  const applyPreset = (preset: "today" | "7d" | "month") => {
    if (preset === "today") {
      setFromDate(today);
      setToDate(today);
    } else if (preset === "7d") {
      setFromDate(shiftIsoDate(today, -6));
      setToDate(today);
    } else {
      setFromDate(monthStart);
      setToDate(today);
    }
  };

  const hasActiveFilters = Boolean(employeeFilter || taskSearch.trim() || category !== "ALL");

  return (
    <div className="space-y-6">
      {/* Page Header & Distinct Export Actions */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">
            Activity History
          </h1>
          <p className="mt-0.5 text-xs text-slate-400">
            Search completed records and export genuine Excel reports ({fromDate} → {toDate})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="emerald"
            size="md"
            disabled={exportingType !== null || !fromDate || !toDate}
            onClick={() => void handleExport("daily")}
          >
            {exportingType === "daily" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span>Export Daily Tasks</span>
          </Button>

          <Button
            variant="secondary"
            size="md"
            className="border-amber-500/35 bg-amber-500/10 text-amber-200 hover:border-amber-500/50 hover:bg-amber-500/20"
            disabled={exportingType !== null || !fromDate || !toDate}
            onClick={() => void handleExport("downtime")}
          >
            {exportingType === "downtime" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span>Export Downtime</span>
          </Button>
        </div>
      </div>

      {/* Filters Panel */}
      <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Category Segmented Filter */}
          <div className="inline-flex rounded-xl border border-white/[0.08] bg-surface-input p-1">
            {(
              [
                { id: "ALL", label: "All Activity" },
                { id: "DAILY", label: "Daily Tasks" },
                { id: "MAINTENANCE", label: "Downtime" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCategory(opt.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  category === opt.id
                    ? "bg-white/[0.1] text-slate-100"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Date Quick Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-medium text-slate-500">Range:</span>
            <button
              type="button"
              onClick={() => applyPreset("today")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                fromDate === today && toDate === today
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-white/[0.04] text-slate-400 hover:text-slate-200"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => applyPreset("7d")}
              className="rounded-lg bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-400 transition hover:text-slate-200"
            >
              Last 7d
            </button>
            <button
              type="button"
              onClick={() => applyPreset("month")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                fromDate === monthStart && toDate === today
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-white/[0.04] text-slate-400 hover:text-slate-200"
              }`}
            >
              This Month
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-400">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={inputClassName}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-400">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={inputClassName}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-400">Technician</label>
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className={selectClassName}
            >
              <option value="">All Technicians</option>
              {employeeOptions.map((emp) => (
                <option key={emp} value={emp}>
                  {emp}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-400">Task Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                placeholder="Search by task title..."
                className={`${inputClassName} pl-9 pr-8`}
              />
              {taskSearch && (
                <button
                  type="button"
                  onClick={() => setTaskSearch("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-200"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 text-xs text-slate-400">
          <span>
            <strong className="font-mono tabular-nums text-slate-200">{items.length}</strong>{" "}
            record{items.length === 1 ? "" : "s"} found
          </span>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setEmployeeFilter("");
                  setTaskSearch("");
                  setCategory("ALL");
                }}
                className="text-xs font-medium text-amber-400 hover:text-amber-300"
              >
                Reset filters
              </button>
            )}
            <Button variant="ghost" onClick={() => void loadHistory()} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<History className="h-5 w-5" />}
          title="No activity records match your filters"
          description="Try expanding the date range or clearing the technician/task filters."
        />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden overflow-hidden rounded-2xl border border-white/[0.08] bg-surface md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/[0.07] bg-surface-input text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Scheduled</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Task</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Completed By</th>
                    <th className="px-4 py-3">Completed At (Bucharest)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {items.map((item) => {
                    const isCompleted = item.status === "Completed";
                    return (
                      <tr key={item.id} className="transition hover:bg-white/[0.025]">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-slate-300">
                          <div>{item.scheduledDate}</div>
                          <div className="text-slate-500">
                            {item.taskType === "DAILY"
                              ? item.scheduledTime ?? "—"
                              : item.window ?? "—"}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <StatusBadge tone={item.taskType === "DAILY" ? "neutral" : "amber"}>
                            {item.taskType === "DAILY" ? "Daily" : "Downtime"}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-100">{item.taskTitle}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {isCompleted ? (
                            <StatusBadge tone="emerald">
                              <CheckCircle2 className="h-3 w-3" />
                              Completed
                            </StatusBadge>
                          ) : (
                            <StatusBadge tone="amber">
                              <Clock className="h-3 w-3" />
                              Pending
                            </StatusBadge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-200">{item.completedBy ?? "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-slate-400">
                          {item.completedAt ? formatBucharestDateTime(item.completedAt) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card List */}
          <div className="space-y-2.5 md:hidden">
            {items.map((item) => {
              const isCompleted = item.status === "Completed";
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-white/[0.08] bg-surface-card p-3.5 shadow-card"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs font-medium tabular-nums text-slate-300">
                        {item.scheduledDate}
                        {item.taskType === "DAILY" && item.scheduledTime
                          ? ` · ${item.scheduledTime}`
                          : item.window
                            ? ` · ${item.window}`
                            : ""}
                      </span>
                      <StatusBadge tone={item.taskType === "DAILY" ? "neutral" : "amber"}>
                        {item.taskType === "DAILY" ? "Daily" : "Downtime"}
                      </StatusBadge>
                    </div>
                    <StatusBadge tone={isCompleted ? "emerald" : "amber"}>
                      {item.status}
                    </StatusBadge>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-100">{item.taskTitle}</div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-medium text-slate-200">{item.completedBy ?? "—"}</span>
                    <span className="font-mono tabular-nums">
                      {item.completedAt ? formatBucharestDateTime(item.completedAt) : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
