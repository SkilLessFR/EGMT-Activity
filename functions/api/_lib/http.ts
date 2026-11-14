import type {
  ApiErrorResponse,
  MaintenanceWindow,
  RosterShift,
  Shift,
  TargetShift,
} from "../../../src/shared/types";

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export function errorResponse(
  error: string,
  status = 400,
  details?: string[]
): Response {
  const body: ApiErrorResponse = details?.length
    ? { error, details }
    : { error };
  return jsonResponse(body, status);
}

export async function parseJsonBody<T>(
  request: Request
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  try {
    const data = (await request.json()) as T;
    if (data === null || typeof data !== "object") {
      return {
        ok: false,
        response: errorResponse("Request body must be a JSON object", 400),
      };
    }
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      response: errorResponse("Invalid JSON request body", 400),
    };
  }
}

export function isNonEmptyString(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

export function isValidIsoDate(val: unknown): val is string {
  if (typeof val !== "string") return false;
  const match = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(val);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function isValidMonthKey(val: unknown): val is string {
  return typeof val === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(val);
}

export function isValidTimeHHMM(val: unknown): val is string {
  return (
    typeof val === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(val)
  );
}

const VALID_SHIFTS = new Set<string>(["M", "A", "N", "MID"]);
const VALID_ROSTER_SHIFTS = new Set<string>(["M", "A", "N", "MID", "OFF"]);
const VALID_WINDOWS = new Set<string>(["MORNING", "NIGHT"]);

export function isValidShift(val: unknown): val is Shift {
  return typeof val === "string" && VALID_SHIFTS.has(val);
}

export function isValidTargetShift(val: unknown): val is TargetShift {
  return val === "ALL_ACTIVE" || isValidShift(val);
}

export function isValidRosterShift(val: unknown): val is RosterShift {
  return typeof val === "string" && VALID_ROSTER_SHIFTS.has(val);
}

export function isValidMaintenanceWindow(
  val: unknown
): val is MaintenanceWindow {
  return typeof val === "string" && VALID_WINDOWS.has(val);
}
