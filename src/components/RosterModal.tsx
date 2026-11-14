import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileJson, Upload, Users, X } from "lucide-react";
import { getErrorMessage, uploadRoster } from "../api/client";
import { rosterMonthToKey } from "../shared/timezone";
import type { RosterData, RosterShift } from "../shared/types";

interface RosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRoster: RosterData | null;
  onRosterUploaded: (roster: RosterData, monthKey: string) => void;
}

const VALID_ROSTER_SHIFTS = new Set<RosterShift>(["M", "A", "N", "MID", "OFF"]);

function validateRosterClient(data: unknown): { roster?: RosterData; errors: string[] } {
  const errors: string[] = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { errors: ["JSON root must be an object matching Schedule_YYYY_MM.json."] };
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.fileName !== "string" || obj.fileName.trim().length === 0) {
    errors.push("Missing or invalid 'fileName' (expected non-empty string).");
  }
  if (typeof obj.month !== "number" || !Number.isInteger(obj.month) || obj.month < 0 || obj.month > 11) {
    errors.push("Missing or invalid 'month' (expected 0-based integer 0..11, e.g. 10 for November).");
  }
  if (typeof obj.year !== "number" || !Number.isInteger(obj.year) || obj.year < 2000 || obj.year > 2100) {
    errors.push("Missing or invalid 'year' (expected integer 2000..2100).");
  }
  if (!Array.isArray(obj.employees) || obj.employees.length === 0) {
    errors.push("Missing or empty 'employees' array.");
  } else if (obj.employees.some((e) => typeof e !== "string" || e.trim().length === 0)) {
    errors.push("All entries in 'employees' must be non-empty strings.");
  }

  if (!Array.isArray(obj.dateColumns) || obj.dateColumns.length === 0) {
    errors.push("Missing or empty 'dateColumns' array.");
  } else {
    for (let i = 0; i < obj.dateColumns.length; i++) {
      const col = obj.dateColumns[i] as Record<string, unknown> | undefined;
      if (
        !col ||
        typeof col !== "object" ||
        typeof col.index !== "number" ||
        typeof col.date !== "string" ||
        typeof col.isoDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(col.isoDate)
      ) {
        errors.push(`Invalid dateColumns[${i}] entry (requires index, date, and YYYY-MM-DD isoDate).`);
        break;
      }
    }
  }

  if (!obj.rows || typeof obj.rows !== "object" || Array.isArray(obj.rows)) {
    errors.push("Missing or invalid 'rows' object.");
  } else if (Array.isArray(obj.employees)) {
    const rows = obj.rows as Record<string, unknown>;
    for (const emp of obj.employees) {
      if (typeof emp !== "string") continue;
      const empRow = rows[emp];
      if (!empRow || typeof empRow !== "object" || Array.isArray(empRow)) {
        errors.push(`Missing shift row for employee "${emp}".`);
        break;
      }
      for (const [colIdx, val] of Object.entries(empRow as Record<string, unknown>)) {
        if (typeof val !== "string" || !VALID_ROSTER_SHIFTS.has(val as RosterShift)) {
          errors.push(`Invalid shift "${String(val)}" for "${emp}" at column ${colIdx}.`);
          break;
        }
      }
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  return { roster: data as RosterData, errors: [] };
}

export function RosterModal({
  isOpen,
  onClose,
  currentRoster,
  onRosterUploaded,
}: RosterModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsedRoster, setParsedRoster] = useState<RosterData | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = async (file: File | undefined) => {
    setValidationErrors([]);
    setServerError(null);
    setParsedRoster(null);

    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text) as unknown;
      const { roster, errors } = validateRosterClient(json);
      if (errors.length > 0 || !roster) {
        setValidationErrors(errors);
        return;
      }
      setParsedRoster(roster);
    } catch (err) {
      setValidationErrors([
        err instanceof Error ? `Invalid JSON file: ${err.message}` : "Failed to parse JSON file.",
      ]);
    }
  };

  const handleUpload = async () => {
    if (!parsedRoster) return;
    setIsUploading(true);
    setServerError(null);
    try {
      const res = await uploadRoster(parsedRoster);
      onRosterUploaded(res.roster, res.monthKey);
      setParsedRoster(null);
      onClose();
    } catch (err) {
      setServerError(getErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <FileJson className="h-5 w-5 text-amber-400" />
            <h2 className="text-base font-semibold text-slate-100">Shift Roster Management</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {currentRoster && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Active Roster in View</span>
                <span className="font-mono text-emerald-400">
                  {rosterMonthToKey(currentRoster.year, currentRoster.month)}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-200">
                <span className="font-medium">{currentRoster.fileName}</span>
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <Users className="h-3.5 w-3.5" />
                  {currentRoster.employees.length} employees · {currentRoster.dateColumns.length} days
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-400">
              Upload Schedule JSON (Schedule_YYYY_MM.json)
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/50 px-4 py-6 text-center transition hover:border-amber-500/60 hover:bg-slate-900"
            >
              <Upload className="h-7 w-7 text-amber-400" />
              <p className="mt-2 text-sm font-medium text-slate-200">
                Click to select roster JSON file
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Supports shifts M, A, N, MID, OFF with 0-based month &amp; isoDate columns
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files?.[0])}
              />
            </div>
          </div>

          {validationErrors.length > 0 && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3.5 text-sm text-red-200">
              <div className="flex items-center gap-2 font-medium text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Validation Errors</span>
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-200">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {serverError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3.5 text-xs text-red-200">
              <div className="flex items-center gap-2 font-medium text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Server Upload Error</span>
              </div>
              <p className="mt-1">{serverError}</p>
            </div>
          )}

          {parsedRoster && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Ready to upload: {parsedRoster.fileName}</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-300">
                <div className="rounded bg-slate-900/80 px-2.5 py-1.5">
                  <div className="text-slate-500">Month</div>
                  <div className="font-mono font-medium">
                    {rosterMonthToKey(parsedRoster.year, parsedRoster.month)}
                  </div>
                </div>
                <div className="rounded bg-slate-900/80 px-2.5 py-1.5">
                  <div className="text-slate-500">Employees</div>
                  <div className="font-mono font-medium">{parsedRoster.employees.length}</div>
                </div>
                <div className="rounded bg-slate-900/80 px-2.5 py-1.5">
                  <div className="text-slate-500">Days</div>
                  <div className="font-mono font-medium">{parsedRoster.dateColumns.length}</div>
                </div>
              </div>
              <div className="mt-2 max-h-24 overflow-y-auto text-xs text-slate-400">
                Staff: {parsedRoster.employees.join(", ")}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-slate-800 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!parsedRoster || isUploading}
            onClick={handleUpload}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Upload className="h-4 w-4" />
            <span>{isUploading ? "Uploading..." : "Save Roster"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
