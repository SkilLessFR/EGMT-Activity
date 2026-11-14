import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileJson, Upload, Users } from "lucide-react";
import { getErrorMessage, uploadRoster } from "../api/client";
import { rosterMonthToKey } from "../shared/timezone";
import type { RosterData, RosterShift } from "../shared/types";
import { Modal } from "./ui/Modal";
import { Button, StatusBadge } from "./ui/Primitives";
import { useToast } from "./ui/Toast";

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
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsedRoster, setParsedRoster] = useState<RosterData | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleClose = () => {
    setParsedRoster(null);
    setValidationErrors([]);
    setServerError(null);
    onClose();
  };

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
      showToast({
        tone: "success",
        title: `Roster ${res.monthKey} updated`,
        description: `${res.roster.employees.length} technicians loaded for ${res.roster.dateColumns.length} days.`,
      });
      handleClose();
    } catch (err) {
      setServerError(getErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Monthly Shift Roster"
      subtitle="Upload Schedule_YYYY_MM.json to update technician shift eligibility"
      icon={<FileJson className="h-4 w-4" />}
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-4">
        {currentRoster && (
          <div className="rounded-xl border border-white/[0.07] bg-surface-input p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Currently Loaded</span>
              <StatusBadge tone="emerald">
                {rosterMonthToKey(currentRoster.year, currentRoster.month)}
              </StatusBadge>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-200">
              <span className="font-medium">{currentRoster.fileName}</span>
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <Users className="h-3.5 w-3.5" />
                {currentRoster.employees.length} staff · {currentRoster.dateColumns.length} days
              </span>
            </div>
          </div>
        )}

        <div
          onClick={() => fileInputRef.current?.click()}
          className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.15] bg-surface-input/70 px-4 py-7 text-center transition hover:border-amber-400/50 hover:bg-white/[0.02]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 transition group-hover:scale-105">
            <Upload className="h-5 w-5" />
          </div>
          <p className="mt-2.5 text-sm font-medium text-slate-200">
            Select roster JSON file
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Supports shifts M, A, N, MID, OFF with 0-based month &amp; isoDate columns
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => void handleFileChange(e.target.files?.[0])}
          />
        </div>

        {validationErrors.length > 0 && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-200">
            <div className="flex items-center gap-2 font-medium text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Validation Errors</span>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-200/90">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {serverError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-200">
            <div className="flex items-center gap-2 font-medium text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Upload Failed</span>
            </div>
            <p className="mt-1">{serverError}</p>
          </div>
        )}

        {parsedRoster && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Validated: {parsedRoster.fileName}</span>
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-black/25 px-3 py-2">
                <div className="text-slate-400">Month</div>
                <div className="mt-0.5 font-mono font-semibold text-slate-100">
                  {rosterMonthToKey(parsedRoster.year, parsedRoster.month)}
                </div>
              </div>
              <div className="rounded-lg bg-black/25 px-3 py-2">
                <div className="text-slate-400">Employees</div>
                <div className="mt-0.5 font-mono font-semibold text-slate-100">
                  {parsedRoster.employees.length}
                </div>
              </div>
              <div className="rounded-lg bg-black/25 px-3 py-2">
                <div className="text-slate-400">Days</div>
                <div className="mt-0.5 font-mono font-semibold text-slate-100">
                  {parsedRoster.dateColumns.length}
                </div>
              </div>
            </div>
            <div className="mt-2.5 max-h-24 overflow-y-auto text-xs leading-relaxed text-slate-300/80">
              {parsedRoster.employees.join(", ")}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] pt-4">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!parsedRoster || isUploading}
            onClick={() => void handleUpload()}
          >
            {isUploading ? "Uploading..." : "Save Roster"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
