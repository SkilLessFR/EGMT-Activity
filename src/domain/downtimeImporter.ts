import ExcelJS from "exceljs";
import { formatTimeInterval24h } from "../shared/timezone";
import type {
  DowntimeMonthSchedule,
  DowntimePhase,
  DowntimeTask,
  MaintenanceWindow,
} from "../shared/types";

export interface ParsedDowntimeSheet {
  phase: DowntimePhase;
  tasks: DowntimeTask[];
  passCount: number;
}

export interface ParsedDowntimeWorkbook {
  fileName: string;
  monthKey: string;
  sheets: ParsedDowntimeSheet[];
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${d}.${m}.${y}`;
  }
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) => part.text ?? "")
        .join("")
        .trim();
    }
    if ("result" in value && value.result !== undefined) {
      return cellToString(value.result as ExcelJS.CellValue);
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }
  }
  return String(value).trim();
}

function toSlug(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "studio"
  );
}

function parseDottedDateToIso(raw: string): string | null {
  const match = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (!match) return null;
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3];
  return `${year}-${month}-${day}`;
}

function parseDateRange(text: string): {
  scheduledDate: string;
  endDate?: string;
} | null {
  const matches = Array.from(
    text.matchAll(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/g)
  );
  if (matches.length === 0) return null;
  const first = parseDottedDateToIso(matches[0][0]);
  if (!first) return null;
  if (matches.length > 1) {
    const second = parseDottedDateToIso(matches[1][0]);
    if (second && second !== first) {
      return { scheduledDate: first, endDate: second };
    }
  }
  return { scheduledDate: first };
}

function parsePhaseNumberFromName(name: string): number | null {
  const match = name.match(/phase\s*(\d+)/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveInt(raw: string): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^\d]/g, "");
  if (!cleaned) return undefined;
  const num = Number.parseInt(cleaned, 10);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

function parseTeamList(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function findHeaderRow(ws: ExcelJS.Worksheet): number | null {
  const maxScan = Math.min(ws.rowCount || 15, 15);
  for (let r = 1; r <= maxScan; r++) {
    const row = ws.getRow(r);
    const c2 = cellToString(row.getCell(2).value).toUpperCase();
    const c3 = cellToString(row.getCell(3).value).toUpperCase();
    if (c2 === "PHASE" && c3 === "STUDIO") {
      return r;
    }
  }
  return null;
}

function parseRow2Metadata(
  ws: ExcelJS.Worksheet,
  headerRow: number
): {
  scheduledDate: string;
  endDate?: string;
  shiftLabel: string;
  window: MaintenanceWindow;
  defaultTeam: string[];
} {
  let scheduledDate = "";
  let endDate: string | undefined;
  let shiftLabel = "DAY SHIFT";
  let window: MaintenanceWindow = "MORNING";
  let defaultTeam: string[] = [];

  for (let r = 1; r < headerRow; r++) {
    const row = ws.getRow(r);
    let shiftCol = -1;

    for (let c = 1; c <= 10; c++) {
      const text = cellToString(row.getCell(c).value);
      if (!text) continue;

      if (/^date\s*:/i.test(text) && !scheduledDate) {
        const range = parseDateRange(text);
        if (range) {
          scheduledDate = range.scheduledDate;
          endDate = range.endDate;
        }
      } else if (/(day|night)\s*shift/i.test(text)) {
        shiftLabel = text.toUpperCase();
        window = /night/i.test(text) ? "NIGHT" : "MORNING";
        shiftCol = c;
      }
    }

    if (shiftCol !== -1) {
      for (let c = shiftCol + 1; c <= 10; c++) {
        const text = cellToString(row.getCell(c).value);
        if (
          text &&
          !/^date\s*:/i.test(text) &&
          !/(day|night)\s*shift/i.test(text)
        ) {
          defaultTeam = parseTeamList(text);
          break;
        }
      }
    }
  }

  return { scheduledDate, endDate, shiftLabel, window, defaultTeam };
}

export async function parseDowntimeWorkbook(
  buffer: ArrayBuffer,
  fileName: string
): Promise<ParsedDowntimeWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheets: ParsedDowntimeSheet[] = [];
  const now = new Date().toISOString();

  for (const ws of workbook.worksheets) {
    if (ws.name.toLowerCase().includes("instruction")) continue;
    const headerRow = findHeaderRow(ws);
    if (!headerRow) continue;

    const meta = parseRow2Metadata(ws, headerRow);
    const sheetPhaseNumber = parsePhaseNumberFromName(ws.name);
    const notices: string[] = [];
    const seenNotices = new Set<string>();
    const tasks: DowntimeTask[] = [];
    let passCount = 0;
    let currentSectionNote: string | undefined;
    let detectedPhaseNumber = sheetPhaseNumber ?? 0;

    const scheduledDate = meta.scheduledDate;
    const monthKey = scheduledDate ? scheduledDate.slice(0, 7) : "";

    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const c2 = cellToString(row.getCell(2).value);
      const c3 = cellToString(row.getCell(3).value);
      const c4 = cellToString(row.getCell(4).value);
      const c5 = cellToString(row.getCell(5).value);
      const c6 = cellToString(row.getCell(6).value);
      const c7 = cellToString(row.getCell(7).value);
      const c8 = cellToString(row.getCell(8).value);

      if (!c2 && !c3 && !c4 && !c5 && !c6 && !c7 && !c8) {
        continue;
      }

      const rowPhase = Number.parseInt(c2, 10);
      const isNumericPhase = /^\d+$/.test(c2) && Number.isFinite(rowPhase);

      // Merged / full-row notice banner (e.g. UPS warning or "Special LED Intervention")
      if (!isNumericPhase && c2 && !c8) {
        if (!seenNotices.has(c2)) {
          seenNotices.add(c2);
          notices.push(c2);
        }
        if (tasks.length > 0) {
          currentSectionNote = c2;
        }
        continue;
      }

      if (!isNumericPhase || !c3) {
        continue;
      }

      if (detectedPhaseNumber === 0) {
        detectedPhaseNumber = rowPhase;
      }

      const description = c8 || "Maintenance";
      const isPass = description.trim().toLowerCase() === "pass";
      if (isPass) {
        passCount += 1;
      }

      const phaseNum = detectedPhaseNumber || rowPhase;
      const effectiveMonthKey = monthKey || now.slice(0, 7);
      const id = `dt:${effectiveMonthKey}:p${phaseNum}:r${r}:${toSlug(c3)}`;

      tasks.push({
        id,
        monthKey: effectiveMonthKey,
        phaseNumber: phaseNum,
        scheduledDate: scheduledDate || `${effectiveMonthKey}-01`,
        ...(meta.endDate ? { endDate: meta.endDate } : {}),
        window: meta.window,
        studio: c3,
        accessInterval: formatTimeInterval24h(c4),
        ...(parsePositiveInt(c5) !== undefined
          ? { idealTimeMin: parsePositiveInt(c5) }
          : {}),
        ...(parsePositiveInt(c6) !== undefined
          ? { tablesCount: parsePositiveInt(c6) }
          : {}),
        location: c7,
        description,
        isPass,
        ...(currentSectionNote ? { sectionNote: currentSectionNote } : {}),
        assignedPeople: [...meta.defaultTeam],
        enabled: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (detectedPhaseNumber === 0 && tasks.length === 0) {
      continue;
    }

    const phase: DowntimePhase = {
      phaseNumber: detectedPhaseNumber || sheets.length + 1,
      title: ws.name.trim(),
      scheduledDate: scheduledDate || `${now.slice(0, 7)}-01`,
      ...(meta.endDate ? { endDate: meta.endDate } : {}),
      shiftLabel: meta.shiftLabel,
      window: meta.window,
      defaultTeam: meta.defaultTeam,
      notices,
    };

    sheets.push({ phase, tasks, passCount });
  }

  if (sheets.length === 0) {
    throw new Error(
      `No valid Downtime Phase sheets found in "${fileName}". Expected sheets with PHASE / STUDIO headers.`
    );
  }

  const firstDate = sheets[0]?.phase.scheduledDate ?? now.slice(0, 10);
  return {
    fileName,
    monthKey: firstDate.slice(0, 7),
    sheets,
  };
}

export function buildDowntimeScheduleFromWorkbooks(
  workbooks: ParsedDowntimeWorkbook[],
  options: { includePassRows: boolean }
): {
  schedule: DowntimeMonthSchedule;
  skippedPassCount: number;
} {
  if (workbooks.length === 0) {
    throw new Error("At least one Excel workbook is required.");
  }

  const phaseMap = new Map<number, ParsedDowntimeSheet>();
  for (const wb of workbooks) {
    for (const sheet of wb.sheets) {
      phaseMap.set(sheet.phase.phaseNumber, sheet);
    }
  }

  const sortedSheets = Array.from(phaseMap.values()).sort(
    (a, b) => a.phase.phaseNumber - b.phase.phaseNumber
  );

  const monthKey =
    sortedSheets[0]?.phase.scheduledDate.slice(0, 7) ??
    workbooks[0].monthKey;

  let skippedPassCount = 0;
  const phases: DowntimePhase[] = [];
  const tasks: DowntimeTask[] = [];

  for (const sheet of sortedSheets) {
    phases.push(sheet.phase);
    for (const task of sheet.tasks) {
      if (task.isPass && !options.includePassRows) {
        skippedPassCount += 1;
        continue;
      }
      tasks.push({
        ...task,
        monthKey,
      });
    }
  }

  return {
    schedule: {
      monthKey,
      fileNames: workbooks.map((w) => w.fileName),
      uploadedAt: new Date().toISOString(),
      includePassRows: options.includePassRows,
      phases,
      tasks,
    },
    skippedPassCount,
  };
}
