import type { PagesFunction } from "@cloudflare/workers-types";
import type { RosterData, RosterGetResponse } from "../../../src/shared/types";
import { errorResponse, isValidMonthKey, jsonResponse } from "../_lib/http";
import { type Env, rosterKey } from "../_lib/kv";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const rawMonth = context.params.month;
  const monthKey = Array.isArray(rawMonth) ? rawMonth[0] : rawMonth;

  if (!isValidMonthKey(monthKey)) {
    return errorResponse("Invalid month parameter; expected YYYY-MM", 400);
  }

  const roster = await context.env.EGMT_ACTIVIT.get<RosterData>(
    rosterKey(monthKey),
    "json"
  );

  if (!roster) {
    return errorResponse(`No roster uploaded for ${monthKey}`, 404);
  }

  const response: RosterGetResponse = {
    monthKey,
    roster,
  };

  return jsonResponse(response, 200);
};
