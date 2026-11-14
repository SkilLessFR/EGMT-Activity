import type { PagesFunction } from "@cloudflare/workers-types";
import type {
  RosterData,
  RosterDateColumn,
  RosterShift,
  RosterUploadResponse,
} from "../../../src/shared/types";
import { rosterMonthToKey } from "../../../src/shared/timezone";
import {
  errorResponse,
  isNonEmptyString,
  isValidIsoDate,
  isValidRosterShift,
  jsonResponse,
  parseJsonBody,
} from "../_lib/http";
import { type Env, rosterKey } from "../_lib/kv";

function validateRosterPayload(
  raw: unknown
): { ok: true; roster: RosterData; monthKey: string } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["Roster payload must be a JSON object"] };
  }

  const obj = raw as Record<string, unknown>;

  if (!isNonEmptyString(obj.fileName)) {
    errors.push("fileName must be a non-empty string");
  }

  if (
    typeof obj.month !== "number" ||
    !Number.isInteger(obj.month) ||
    obj.month < 0 ||
    obj.month > 11
  ) {
    errors.push("month must be an integer between 0 and 11 (0-based JS month)");
  }

  if (
    typeof obj.year !== "number" ||
    !Number.isInteger(obj.year) ||
    obj.year < 2000 ||
    obj.year > 2100
  ) {
    errors.push("year must be an integer between 2000 and 2100");
  }

  if (!Array.isArray(obj.employees) || obj.employees.length === 0) {
    errors.push("employees must be a non-empty array of strings");
  } else {
    const seen = new Set<string>();
    obj.employees.forEach((emp, idx) => {
      if (!isNonEmptyString(emp)) {
        errors.push(`employees[${idx}] must be a non-empty string`);
      } else if (seen.has(emp)) {
        errors.push(`employees[${idx}] is duplicated: "${emp}"`);
      } else {
        seen.add(emp);
      }
    });
  }

  const monthKey =
    typeof obj.year === "number" &&
    typeof obj.month === "number" &&
    Number.isInteger(obj.year) &&
    Number.isInteger(obj.month) &&
    obj.month >= 0 &&
    obj.month <= 11
      ? rosterMonthToKey(obj.year, obj.month)
      : "";

  const isoDates: string[] = [];
  if (!Array.isArray(obj.dateColumns) || obj.dateColumns.length === 0) {
    errors.push("dateColumns must be a non-empty array");
  } else {
    obj.dateColumns.forEach((col, idx) => {
      if (col === null || typeof col !== "object" || Array.isArray(col)) {
        errors.push(`dateColumns[${idx}] must be an object`);
        return;
      }
      const c = col as Record<string, unknown>;
      if (typeof c.index !== "number" || !Number.isInteger(c.index) || c.index < 0) {
        errors.push(`dateColumns[${idx}].index must be a non-negative integer`);
      }
      if (!isNonEmptyString(c.date)) {
        errors.push(`dateColumns[${idx}].date must be a non-empty string`);
      }
      if (!isValidIsoDate(c.isoDate)) {
        errors.push(`dateColumns[${idx}].isoDate must be a valid YYYY-MM-DD date`);
      } else {
        isoDates.push(c.isoDate);
        if (monthKey && !c.isoDate.startsWith(monthKey)) {
          errors.push(
            `dateColumns[${idx}].isoDate (${c.isoDate}) does not match roster month (${monthKey})`
          );
        }
      }
    });
  }

  if (obj.rows === null || typeof obj.rows !== "object" || Array.isArray(obj.rows)) {
    errors.push("rows must be an object keyed by employee name");
  } else if (Array.isArray(obj.employees)) {
    const rows = obj.rows as Record<string, unknown>;
    for (const emp of obj.employees) {
      if (typeof emp !== "string") continue;
      const empRow = rows[emp];
      if (empRow === null || typeof empRow !== "object" || Array.isArray(empRow)) {
        errors.push(`rows["${emp}"] must be an object mapping isoDate to shift`);
        continue;
      }
      const rowMap = empRow as Record<string, unknown>;
      for (const isoDate of isoDates) {
        const shift = rowMap[isoDate];
        if (!isValidRosterShift(shift)) {
          errors.push(
            `rows["${emp}"]["${isoDate}"] must be one of M, A, N, MID, OFF`
          );
          break;
        }
      }
      for (const [dateKey, val] of Object.entries(rowMap)) {
        if (!isValidIsoDate(dateKey)) {
          errors.push(`rows["${emp}"] has invalid date key "${dateKey}"`);
          break;
        }
        if (!isValidRosterShift(val)) {
          errors.push(
            `rows["${emp}"]["${dateKey}"] has invalid shift "${String(val)}"`
          );
          break;
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors: errors.slice(0, 15) };
  }

  const normalizedRows: Record<string, Record<string, RosterShift>> = {};
  const employees = (obj.employees as string[]).map((e) => e.trim());
  const rawRows = obj.rows as Record<string, Record<string, RosterShift>>;
  for (const emp of obj.employees as string[]) {
    normalizedRows[emp.trim()] = { ...rawRows[emp] };
  }

  const roster: RosterData = {
    fileName: (obj.fileName as string).trim(),
    month: obj.month as number,
    year: obj.year as number,
    employees,
    dateColumns: (obj.dateColumns as RosterDateColumn[]).map((c) => ({
      index: c.index,
      date: c.date,
      isoDate: c.isoDate,
    })),
    rows: normalizedRows,
  };

  return { ok: true, roster, monthKey };
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const parsed = await parseJsonBody<unknown>(context.request);
  if (!parsed.ok) return parsed.response;

  const validated = validateRosterPayload(parsed.data);
  if (!validated.ok) {
    return errorResponse("Invalid roster JSON schema", 400, validated.errors);
  }

  const { roster, monthKey } = validated;
  await context.env.EGMT_ACTIVIT.put(
    rosterKey(monthKey),
    JSON.stringify(roster)
  );

  const response: RosterUploadResponse = {
    monthKey,
    roster,
    summary: {
      monthKey,
      employeeCount: roster.employees.length,
      dateCount: roster.dateColumns.length,
    },
  };

  return jsonResponse(response, 200);
};
