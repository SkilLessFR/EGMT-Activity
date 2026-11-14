import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  buildMaintenanceRangeItems,
  buildUnifiedHistory,
  generateDailyExportBuffer,
  generateDowntimeExportBuffer,
  getMonthlyMaintenanceSlots,
} from "../src/domain/history";
import type { MaintenanceTask, TaskCompletion } from "../src/shared/types";
import { onRequestGet as historyGet } from "../functions/api/history/index";
import { onRequestGet as exportGet } from "../functions/api/history/export";
import type { Env } from "../functions/api/_lib/kv";

const maintenanceTasks: MaintenanceTask[] = [
  {
    id: "maint-m1",
    title: "Morning Line Inspection",
    window: "MORNING",
    enabled: true,
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
  },
  {
    id: "maint-n1",
    title: "Night Server Patch",
    window: "NIGHT",
    enabled: true,
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
  },
  {
    id: "maint-disabled",
    title: "Disabled Check",
    window: "MORNING",
    enabled: false,
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-01T08:00:00.000Z",
  },
];

const dailyCompletions: TaskCompletion[] = [
  {
    id: "comp-d1",
    occurrenceId: "daily-1:2026-11-01:08:00",
    taskId: "daily-1",
    taskType: "DAILY",
    taskTitle: "Check Boiler Pressure",
    scheduledDate: "2026-11-01",
    scheduledTime: "08:00",
    completedBy: "Alex Ionescu",
    completedAt: "2026-11-01T06:15:00.000Z", // 08:15 Europe/Bucharest (UTC+2 in Nov)
  },
  {
    id: "comp-d2",
    occurrenceId: "daily-2:2026-11-05:14:00",
    taskId: "daily-2",
    taskType: "DAILY",
    taskTitle: "Log Shift Handover",
    scheduledDate: "2026-11-05",
    scheduledTime: "14:00",
    completedBy: "Maria Pop",
    completedAt: "2026-11-05T12:10:00.000Z", // 14:10 Europe/Bucharest
  },
  {
    id: "comp-d3",
    occurrenceId: "daily-1:2026-10-31:08:00",
    taskId: "daily-1",
    taskType: "DAILY",
    taskTitle: "Check Boiler Pressure",
    scheduledDate: "2026-10-31",
    scheduledTime: "08:00",
    completedBy: "Alex Ionescu",
    completedAt: "2026-10-31T06:05:00.000Z",
  },
];

const maintenanceCompletions: TaskCompletion[] = [
  {
    id: "comp-m1-a",
    occurrenceId: "maint-m1:2026-11-02:MORNING",
    taskId: "maint-m1",
    taskType: "MAINTENANCE",
    taskTitle: "Morning Line Inspection",
    scheduledDate: "2026-11-02",
    window: "MORNING",
    completedBy: "Alex Ionescu",
    completedAt: "2026-11-02T07:00:00.000Z", // 09:00 Europe/Bucharest
  },
  {
    id: "comp-m1-b",
    occurrenceId: "maint-m1:2026-11-02:MORNING",
    taskId: "maint-m1",
    taskType: "MAINTENANCE",
    taskTitle: "Morning Line Inspection",
    scheduledDate: "2026-11-02",
    window: "MORNING",
    completedBy: "Elena Radu",
    completedAt: "2026-11-02T07:30:00.000Z", // 09:30 Europe/Bucharest
  },
  {
    id: "comp-deleted-task",
    occurrenceId: "maint-old:2026-11-03:MORNING",
    taskId: "maint-old",
    taskType: "MAINTENANCE",
    taskTitle: "Legacy Calibration",
    scheduledDate: "2026-11-03",
    window: "MORNING",
    completedBy: "Ion Dumitru",
    completedAt: "2026-11-03T08:00:00.000Z",
  },
];

function createMockKv(store: Record<string, unknown>, pageSize = 2): KVNamespace {
  return {
    async get(key: string, type?: string) {
      const val = store[key];
      if (val === undefined) return null;
      if (type === "json") return JSON.parse(JSON.stringify(val));
      return JSON.stringify(val);
    },
    async list(options?: { prefix?: string; cursor?: string }) {
      const prefix = options?.prefix ?? "";
      const matching = Object.keys(store)
        .filter((k) => k.startsWith(prefix))
        .sort();
      const start = options?.cursor ? Number(options.cursor) : 0;
      const slice = matching.slice(start, start + pageSize);
      const next = start + pageSize;
      const list_complete = next >= matching.length;
      return {
        keys: slice.map((name) => ({ name })),
        list_complete,
        cursor: list_complete ? "" : String(next),
        cacheStatus: null,
      };
    },
  } as unknown as KVNamespace;
}

describe("history domain & filtering", () => {
  it("calculates Nov 2026 maintenance dates (1st Mon-Wed & 3rd Mon-Wed)", () => {
    const slots = getMonthlyMaintenanceSlots(2026, 11);
    expect(slots).toEqual([
      { scheduledDate: "2026-11-02", window: "MORNING" },
      { scheduledDate: "2026-11-03", window: "MORNING" },
      { scheduledDate: "2026-11-04", window: "MORNING" },
      { scheduledDate: "2026-11-16", window: "NIGHT" },
      { scheduledDate: "2026-11-17", window: "NIGHT" },
      { scheduledDate: "2026-11-18", window: "NIGHT" },
    ]);
  });

  it("filters inclusively by from..to, employee, task, and category", () => {
    const allInNov = buildUnifiedHistory({
      dailyCompletions,
      maintenanceCompletions,
      maintenanceTasks,
      filters: {
        from: "2026-11-01",
        to: "2026-11-05",
        category: "ALL",
      },
    });

    // 2 daily (Nov 1, Nov 5; Oct 31 excluded)
    // + 2 employee completions on Nov 2 (maint-m1)
    // + 2 pending on Nov 3 & Nov 4 (maint-m1)
    // + 1 legacy completion on Nov 3 (maint-old)
    // (Night slots Nov 16-18 are outside 2026-11-01..2026-11-05)
    expect(allInNov).toHaveLength(7);
    // Newest first
    expect(allInNov[0].scheduledDate).toBe("2026-11-05");
    expect(allInNov[allInNov.length - 1].scheduledDate).toBe("2026-11-01");

    const byEmployee = buildUnifiedHistory({
      dailyCompletions,
      maintenanceCompletions,
      maintenanceTasks,
      filters: {
        from: "2026-11-01",
        to: "2026-11-30",
        employee: "elena",
        category: "ALL",
      },
    });
    expect(byEmployee).toHaveLength(1);
    expect(byEmployee[0].completedBy).toBe("Elena Radu");
    expect(byEmployee[0].status).toBe("Completed");

    const byTaskAndCategory = buildUnifiedHistory({
      dailyCompletions,
      maintenanceCompletions,
      maintenanceTasks,
      filters: {
        from: "2026-11-01",
        to: "2026-11-05",
        task: "boiler",
        category: "DAILY",
      },
    });
    expect(byTaskAndCategory).toHaveLength(1);
    expect(byTaskAndCategory[0].taskTitle).toBe("Check Boiler Pressure");
  });

  it("includes every employee completion row AND pending occurrences for maintenance", () => {
    const items = buildMaintenanceRangeItems(
      maintenanceTasks,
      maintenanceCompletions,
      "2026-11-01",
      "2026-11-30"
    );

    const nov2Rows = items.filter(
      (i) => i.taskId === "maint-m1" && i.scheduledDate === "2026-11-02"
    );
    expect(nov2Rows).toHaveLength(2);
    expect(nov2Rows.map((r) => r.completedBy).sort()).toEqual([
      "Alex Ionescu",
      "Elena Radu",
    ]);
    expect(nov2Rows.every((r) => r.status === "Completed")).toBe(true);

    const pendingRows = items.filter((i) => i.status === "Pending");
    // Nov 3, Nov 4 for maint-m1 (2) + Nov 16, 17, 18 for maint-n1 (3) = 5 pending
    expect(pendingRows).toHaveLength(5);
    for (const row of pendingRows) {
      expect(row.completedBy).toBeNull();
      expect(row.completedAt).toBeNull();
    }

    // Legacy deleted task completion preserved
    expect(items.some((i) => i.taskTitle === "Legacy Calibration")).toBe(true);
  });
});

describe("Excel (.xlsx) export generation", () => {
  it("generates a valid Daily Tasks .xlsx workbook readable by ExcelJS", async () => {
    const bytes = await generateDailyExportBuffer(
      dailyCompletions,
      "2026-11-01",
      "2026-11-05"
    );
    expect(bytes.byteLength).toBeGreaterThan(0);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);

    const ws = wb.getWorksheet("Daily Tasks");
    expect(ws).toBeDefined();
    expect(ws!.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(ws!.autoFilter).toBeDefined();

    const headerRow = ws!.getRow(1);
    expect(headerRow.font?.bold).toBe(true);
    expect(headerRow.values).toEqual([
      undefined,
      "Task Title",
      "Scheduled Date",
      "Scheduled Time",
      "Completed By",
      "Completed At (Europe/Bucharest)",
      "Status",
    ]);

    // 2 daily completions in Nov 1..5 (Oct 31 excluded)
    expect(ws!.rowCount).toBe(3);
    expect(ws!.getRow(2).getCell(1).value).toBe("Check Boiler Pressure");
    expect(ws!.getRow(2).getCell(2).value).toBe("2026-11-01");
    expect(ws!.getRow(2).getCell(3).value).toBe("08:00");
    expect(ws!.getRow(2).getCell(4).value).toBe("Alex Ionescu");
    expect(ws!.getRow(2).getCell(5).value).toBe("2026-11-01 08:15");
    expect(ws!.getRow(2).getCell(6).value).toBe("Completed");
  });

  it("generates a valid Downtime Maintenance .xlsx workbook with multi-employee and Pending rows", async () => {
    const bytes = await generateDowntimeExportBuffer(
      maintenanceTasks,
      maintenanceCompletions,
      "2026-11-01",
      "2026-11-30"
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);

    const ws = wb.getWorksheet("Downtime Maintenance");
    expect(ws).toBeDefined();
    expect(ws!.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(ws!.autoFilter).toBeDefined();

    const headerRow = ws!.getRow(1);
    expect(headerRow.font?.bold).toBe(true);
    expect(headerRow.values).toEqual([
      undefined,
      "Task Title",
      "Window (MORNING/NIGHT)",
      "Scheduled Date",
      "Status (Completed/Pending)",
      "Completed By",
      "Completed At (Europe/Bucharest)",
    ]);

    // 2 completions on Nov 2 + 1 legacy completion on Nov 3 + 5 pending = 8 data rows + 1 header
    expect(ws!.rowCount).toBe(9);

    const rows: Array<{
      title: string;
      window: string;
      date: string;
      status: string;
      by: string;
      at: string;
    }> = [];
    for (let r = 2; r <= ws!.rowCount; r++) {
      const row = ws!.getRow(r);
      rows.push({
        title: String(row.getCell(1).value ?? ""),
        window: String(row.getCell(2).value ?? ""),
        date: String(row.getCell(3).value ?? ""),
        status: String(row.getCell(4).value ?? ""),
        by: String(row.getCell(5).value ?? ""),
        at: String(row.getCell(6).value ?? ""),
      });
    }

    const nov2 = rows.filter((r) => r.date === "2026-11-02");
    expect(nov2).toHaveLength(2);
    expect(nov2.map((r) => r.by).sort()).toEqual([
      "Alex Ionescu",
      "Elena Radu",
    ]);

    const pending = rows.filter((r) => r.status === "Pending");
    expect(pending).toHaveLength(5);
    for (const p of pending) {
      expect(p.by).toBe("");
      expect(p.at).toBe("");
    }
  });
});

describe("History & Export API handlers", () => {
  const mockKv = createMockKv(
    {
      "config:maintenance-tasks": maintenanceTasks,
      "completion:daily:2026-11:comp-d1": dailyCompletions[0],
      "completion:daily:2026-11:comp-d2": dailyCompletions[1],
      "completion:daily:2026-10:comp-d3": dailyCompletions[2],
      "completion:maintenance:2026-11:maint-m1:2026-11-02:MORNING:alex":
        maintenanceCompletions[0],
      "completion:maintenance:2026-11:maint-m1:2026-11-02:MORNING:elena":
        maintenanceCompletions[1],
    },
    1 // Force KV list pagination cursor on every key
  );

  const env: Env = { EGMT_ACTIVIT: mockKv };

  it("GET /api/history paginates KV and returns filtered HistoryItem[]", async () => {
    const req = new Request(
      "https://example.com/api/history?from=2026-10-31&to=2026-11-05&category=DAILY"
    );
    const res = await historyGet({
      request: req,
      env,
    } as unknown as Parameters<typeof historyGet>[0]);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ scheduledDate: string }> };
    expect(body.items).toHaveLength(3);
    expect(body.items[0].scheduledDate).toBe("2026-11-05");
    expect(body.items[2].scheduledDate).toBe("2026-10-31");
  });

  it("GET /api/history/export returns valid xlsx binary with attachment headers", async () => {
    const req = new Request(
      "https://example.com/api/history/export?type=downtime&from=2026-11-01&to=2026-11-18"
    );
    const res = await exportGet({
      request: req,
      env,
    } as unknown as Parameters<typeof exportGet>[0]);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="Downtimes_2026-11-01_to_2026-11-18.xlsx"'
    );

    const buf = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("Downtime Maintenance");
    expect(ws).toBeDefined();
    expect(ws!.rowCount).toBe(8); // 1 header + 2 completed + 5 pending
  });

  it("returns 400 for invalid export parameters", async () => {
    const req = new Request(
      "https://example.com/api/history/export?type=csv&from=2026-11-10&to=2026-11-01"
    );
    const res = await exportGet({
      request: req,
      env,
    } as unknown as Parameters<typeof exportGet>[0]);
    expect(res.status).toBe(400);
  });
});
