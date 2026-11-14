import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  downloadHistoryExport,
  fetchHistory,
  getErrorMessage,
} from "../api/client";
import { formatBucharestDateTime, getBucharestDate } from "../shared/timezone";
import type { HistoryCategory, HistoryItem, RosterData } from "../shared/types";

interface HistoryViewProps {
  roster: RosterData | null;
}

export function HistoryView({ roster }: HistoryViewProps) {
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
  const [exportError, setExportError] = useState<string | null>(null);

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
    setExportError(null);
    try {
      await downloadHistoryExport({ type, from: fromDate, to: toDate });
    } catch (err) {
      setExportError(getErrorMessage(err));
    } finally {
      setExportingType(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls & Export Bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Category</label>
              <div className="relative">
                <Filter className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as HistoryCategory)}
                  className="w-full appearance-none rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
                >
                  <option value="ALL">All Categories</option>
                  <option value="DAILY">Daily Tasks</option>
                  <option value="MAINTENANCE">Downtime</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Employee</label>
              <select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-400 focus:outline-none"
              >
                <option value="">All Employees</option>
                {employeeOptions.map((emp) => (
                  <option key={emp} value={emp}>
                    {emp}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Task Search</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  placeholder="Filter by title..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Export Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadHistory()}
              disabled={loading}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              disabled={exportingType !== null || !fromDate || !toDate}
              onClick={() => void handleExport("daily")}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-50"
            >
              {exportingType === "daily" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>Export Daily Tasks .xlsx</span>
            </button>

            <button
              type="button"
              disabled={exportingType !== null || !fromDate || !toDate}
              onClick={() => void handleExport("downtime")}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/25 disabled:opacity-50"
            >
              {exportingType === "downtime" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>Export Downtimes .xlsx</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {exportError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <span>Export error: {exportError}</span>
        </div>
      )}

      {/* Results Summary */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          Showing <strong className="text-slate-200">{items.length}</strong> record
          {items.length === 1 ? "" : "s"} ({fromDate} to {toDate})
        </span>
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950/70 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Date / Schedule</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Task</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Completed By</th>
                <th className="px-4 py-3 font-medium">Completed At (Bucharest)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-amber-400" />
                    Loading history...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    No history records match the current filters.
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const isCompleted = item.status === "Completed";
                  return (
                    <tr key={item.id} className="hover:bg-slate-800/40">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-300">
                        <div>{item.scheduledDate}</div>
                        <div className="text-slate-500">
                          {item.taskType === "DAILY"
                            ? item.scheduledTime ?? "—"
                            : item.window ?? "—"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-medium ${
                            item.taskType === "DAILY"
                              ? "border-slate-700 bg-slate-800 text-slate-200"
                              : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                          }`}
                        >
                          {item.taskType === "DAILY" ? "Daily" : "Downtime"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-100">{item.taskTitle}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
                            <Clock className="h-3.5 w-3.5" />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-200">{item.completedBy ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-400">
                        {item.completedAt ? formatBucharestDateTime(item.completedAt) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="space-y-2.5 md:hidden">
        {loading && items.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
            Loading history...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-sm text-slate-400">
            No history records match the current filters.
          </div>
        ) : (
          items.map((item) => {
            const isCompleted = item.status === "Completed";
            return (
              <div
                key={item.id}
                className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{item.taskTitle}</div>
                    <div className="mt-0.5 font-mono text-xs text-slate-400">
                      {item.scheduledDate} ·{" "}
                      {item.taskType === "DAILY" ? item.scheduledTime ?? "—" : item.window ?? "—"}
                    </div>
                  </div>
                  {isCompleted ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Completed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
                      <Clock className="h-3.5 w-3.5" />
                      Pending
                    </span>
                  )}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2 text-xs text-slate-300">
                  <span>{item.completedBy ?? "Uncompleted"}</span>
                  <span className="font-mono text-slate-400">
                    {item.completedAt ? formatBucharestDateTime(item.completedAt) : "—"}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
