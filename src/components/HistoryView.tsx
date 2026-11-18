import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
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
import {
  formatBucharestDateTime,
  formatDisplayDate,
  getBucharestDate,
} from "../shared/timezone";
import type {
  HistoryCategory,
  HistoryItem,
  RosterData,
  TemplateLogPhoto,
} from "../shared/types";
import { Modal } from "./ui/Modal";
import {
  Button,
  EmptyState,
  SkeletonCard,
  StatusDot,
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
  const [previewPhoto, setPreviewPhoto] = useState<TemplateLogPhoto | null>(null);

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
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            Activity History
          </h1>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-zinc-500">
            Search completed records and export Excel reports ({fromDate} → {toDate})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
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

      {/* Filters Section */}
      <div className="space-y-3 border-y border-white/[0.06] py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Category Segmented Filter */}
          <div className="inline-flex flex-wrap rounded-lg bg-white/[0.04] p-1">
            {(
              [
                { id: "ALL", label: "All Activity" },
                { id: "DAILY", label: "Daily Tasks" },
                { id: "MAINTENANCE", label: "Downtime" },
                { id: "SCHEDULED", label: "Scheduled" },
                { id: "TEMPLATE", label: "Templates" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCategory(opt.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  category === opt.id
                    ? "btn-primary-theme font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Date Quick Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-zinc-500">Range:</span>
            <button
              type="button"
              onClick={() => applyPreset("today")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                fromDate === today && toDate === today
                  ? "bg-white/[0.1] text-zinc-100"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => applyPreset("7d")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                fromDate === shiftIsoDate(today, -6) && toDate === today
                  ? "bg-white/[0.1] text-zinc-100"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              }`}
            >
              Last 7d
            </button>
            <button
              type="button"
              onClick={() => applyPreset("month")}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                fromDate === monthStart && toDate === today
                  ? "bg-white/[0.1] text-zinc-100"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              }`}
            >
              This Month
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={`${inputClassName} font-mono tabular-nums`}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={`${inputClassName} font-mono tabular-nums`}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-400">Technician</label>
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
            <label className="mb-1 block text-xs font-medium text-zinc-400">Task Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
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
                  className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-200"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 text-xs text-zinc-500">
          <span>
            <strong className="font-mono font-medium tabular-nums text-zinc-200">
              {items.length}
            </strong>{" "}
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
                className="text-xs font-medium text-zinc-300 underline-offset-2 hover:text-zinc-100 hover:underline"
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
        <div className="flex items-center gap-2.5 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="border-t border-white/[0.06]">
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
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/[0.06] text-xs font-medium text-zinc-500">
                <tr>
                  <th className="py-2.5 pr-4 font-medium">Scheduled</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">Task</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Completed By</th>
                  <th className="py-2.5 pl-4 font-medium">Completed At (Bucharest)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {items.map((item) => {
                  const isCompleted = item.status === "Completed";
                  return (
                    <tr key={item.id} className="transition hover:bg-white/[0.02]">
                      <td className="whitespace-nowrap py-3 pr-4 font-mono text-xs tabular-nums text-zinc-300">
                        <div>{formatDisplayDate(item.scheduledDate)}</div>
                        <div className="text-zinc-500">
                          {item.taskType === "DAILY"
                            ? item.scheduledTime ?? "—"
                            : item.window ?? "—"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-400">
                        {item.taskType === "DAILY"
                          ? "Daily"
                          : item.taskType === "SCHEDULED"
                            ? "Scheduled"
                            : item.taskType === "TEMPLATE"
                              ? "Template"
                              : "Downtime"}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-zinc-100">
                        <div>{item.taskTitle}</div>
                        {item.photos && item.photos.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {item.photos.map((photo, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setPreviewPhoto(photo)}
                                className="inline-flex items-center gap-1 rounded border border-white/[0.1] bg-white/[0.03] px-1.5 py-0.5 text-[11px] font-normal text-zinc-300 hover:border-white/[0.25]"
                              >
                                <img
                                  src={photo.dataUrl}
                                  alt={photo.label}
                                  className="h-5 w-5 rounded object-cover"
                                />
                                <span>{photo.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {isCompleted ? (
                          <StatusDot tone="emerald">Completed</StatusDot>
                        ) : (
                          <StatusDot tone="neutral">Pending</StatusDot>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-300">
                        {item.completedBy ?? "—"}
                      </td>
                      <td className="whitespace-nowrap py-3 pl-4 font-mono text-xs tabular-nums text-zinc-500">
                        {item.completedAt ? formatBucharestDateTime(item.completedAt) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Row List */}
          <div className="divide-y divide-white/[0.06] border-t border-white/[0.06] md:hidden">
            {items.map((item) => {
              const isCompleted = item.status === "Completed";
              return (
                <div key={item.id} className="py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono tabular-nums text-zinc-400">
                        {formatDisplayDate(item.scheduledDate)}
                        {item.taskType === "DAILY" && item.scheduledTime
                          ? ` · ${item.scheduledTime}`
                          : item.window
                            ? ` · ${item.window}`
                            : ""}
                      </span>
                      <span className="text-zinc-600">·</span>
                      <span className="text-zinc-500">
                        {item.taskType === "DAILY"
                          ? "Daily"
                          : item.taskType === "SCHEDULED"
                            ? "Scheduled"
                            : item.taskType === "TEMPLATE"
                              ? "Template"
                              : "Downtime"}
                      </span>
                    </div>
                    <StatusDot tone={isCompleted ? "emerald" : "neutral"}>
                      {item.status}
                    </StatusDot>
                  </div>
                  <div className="mt-1.5 text-sm font-medium text-zinc-100">{item.taskTitle}</div>
                  {item.photos && item.photos.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {item.photos.map((photo, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setPreviewPhoto(photo)}
                          className="inline-flex items-center gap-1 rounded border border-white/[0.1] bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-zinc-300"
                        >
                          <img
                            src={photo.dataUrl}
                            alt={photo.label}
                            className="h-5 w-5 rounded object-cover"
                          />
                          <span>{photo.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center justify-between text-xs text-zinc-500">
                    <span className="text-zinc-300">{item.completedBy ?? "—"}</span>
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

      <Modal
        isOpen={previewPhoto !== null}
        onClose={() => setPreviewPhoto(null)}
        title={previewPhoto?.label ?? "Attachment"}
        maxWidthClass="max-w-3xl"
      >
        {previewPhoto && (
          <img
            src={previewPhoto.dataUrl}
            alt={previewPhoto.label}
            className="mx-auto max-h-[75vh] w-auto rounded-lg object-contain"
          />
        )}
      </Modal>
    </div>
  );
}
