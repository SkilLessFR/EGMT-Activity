import {
  generateDailyExportBuffer,
  generateDowntimeExportBuffer,
} from "../../../src/domain/history";
import { getMonthsInRange } from "../../../src/shared/timezone";
import type { MaintenanceTask, TaskCompletion } from "../../../src/shared/types";
import { errorResponse, isValidIsoDate } from "../_lib/http";
import {
  completionDailyPrefix,
  completionMaintenancePrefix,
  type Env,
  KV_KEYS,
  listAllValues,
} from "../_lib/kv";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const type = url.searchParams.get("type");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (type !== "daily" && type !== "downtime") {
    return errorResponse(
      "Invalid or missing 'type'. Expected 'daily' or 'downtime'.",
      400
    );
  }
  if (!from || !isValidIsoDate(from)) {
    return errorResponse(
      "Invalid or missing 'from' date. Expected YYYY-MM-DD.",
      400
    );
  }
  if (!to || !isValidIsoDate(to)) {
    return errorResponse(
      "Invalid or missing 'to' date. Expected YYYY-MM-DD.",
      400
    );
  }
  if (from > to) {
    return errorResponse("'from' date must be on or before 'to' date.", 400);
  }

  const months = getMonthsInRange(from, to);
  const kv = context.env.EGMT_ACTIVIT;

  let buffer: Uint8Array;
  let filename: string;

  if (type === "daily") {
    const dailyBatches = await Promise.all(
      months.map((m) =>
        listAllValues<TaskCompletion>(kv, completionDailyPrefix(m))
      )
    );
    buffer = await generateDailyExportBuffer(dailyBatches.flat(), from, to);
    filename = `Daily_Tasks_${from}_to_${to}.xlsx`;
  } else {
    const [maintenanceBatches, maintenanceTasks] = await Promise.all([
      Promise.all(
        months.map((m) =>
          listAllValues<TaskCompletion>(kv, completionMaintenancePrefix(m))
        )
      ),
      kv.get<MaintenanceTask[]>(KV_KEYS.maintenanceTasks, "json"),
    ]);
    buffer = await generateDowntimeExportBuffer(
      maintenanceTasks ?? [],
      maintenanceBatches.flat(),
      from,
      to
    );
    filename = `Downtimes_${from}_to_${to}.xlsx`;
  }

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
};
