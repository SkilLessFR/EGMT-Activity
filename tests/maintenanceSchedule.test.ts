import { describe, expect, it } from "vitest";
import {
  buildMaintenanceOccurrenceId,
  generateMaintenanceOccurrencesForMonth,
  generateMaintenanceOccurrencesForRange,
  getEligibleMaintenanceEmployees,
  getMaintenanceDatesForMonth,
} from "../src/domain/maintenanceSchedule";
import type {
  MaintenanceTask,
  RosterData,
  TaskCompletion,
} from "../src/shared/types";

function makeTask(overrides: Partial<MaintenanceTask> = {}): MaintenanceTask {
  return {
    id: "task-1",
    title: "UPS Battery Inspection",
    description: "Check UPS voltage and logs",
    window: "MORNING",
    enabled: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeCompletion(
  overrides: Partial<TaskCompletion> = {}
): TaskCompletion {
  return {
    id: "comp-1",
    occurrenceId: "maint:task-1:2026-11-02:MORNING",
    taskId: "task-1",
    taskType: "MAINTENANCE",
    taskTitle: "UPS Battery Inspection",
    scheduledDate: "2026-11-02",
    window: "MORNING",
    completedBy: "Alice",
    completedAt: "2026-11-02T08:15:00.000Z",
    ...overrides,
  };
}

describe("getMaintenanceDatesForMonth", () => {
  it("calculates Nov 2026 (starts on Sunday) Morning=Nov 2,3,4 and Night=Nov 16,17,18", () => {
    const dates = getMaintenanceDatesForMonth(2026, 11);
    expect(dates.MORNING).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
    expect(dates.NIGHT).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
  });

  it("calculates month starting on Monday (June 2026)", () => {
    // 2026-06-01 is Monday
    const dates = getMaintenanceDatesForMonth(2026, 6);
    expect(dates.MORNING).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
    expect(dates.NIGHT).toEqual(["2026-06-15", "2026-06-16", "2026-06-17"]);
  });

  it("calculates month starting on Tuesday (Dec 2026) with sorted 1st/3rd Mon-Wed", () => {
    // 2026-12-01 is Tuesday -> 1st Tue=Dec 1, 1st Wed=Dec 2, 1st Mon=Dec 7
    // 3rd Tue=Dec 15, 3rd Wed=Dec 16, 3rd Mon=Dec 21
    const dates = getMaintenanceDatesForMonth(2026, 12);
    expect(dates.MORNING).toEqual(["2026-12-01", "2026-12-02", "2026-12-07"]);
    expect(dates.NIGHT).toEqual(["2026-12-15", "2026-12-16", "2026-12-21"]);
  });

  it("calculates February in non-leap (2026) and leap (2024) years", () => {
    // Feb 1, 2026 is Sunday
    const feb2026 = getMaintenanceDatesForMonth(2026, 2);
    expect(feb2026.MORNING).toEqual(["2026-02-02", "2026-02-03", "2026-02-04"]);
    expect(feb2026.NIGHT).toEqual(["2026-02-16", "2026-02-17", "2026-02-18"]);

    // Feb 1, 2024 is Thursday
    const feb2024 = getMaintenanceDatesForMonth(2024, 2);
    expect(feb2024.MORNING).toEqual(["2024-02-05", "2024-02-06", "2024-02-07"]);
    expect(feb2024.NIGHT).toEqual(["2024-02-19", "2024-02-20", "2024-02-21"]);
  });

  it("handles Dec -> Jan year transition cleanly", () => {
    const dec2026 = getMaintenanceDatesForMonth(2026, 12);
    // Jan 1, 2027 is Friday -> 1st Mon=Jan 4, Tue=Jan 5, Wed=Jan 6; 3rd=Jan 18,19,20
    const jan2027 = getMaintenanceDatesForMonth(2027, 1);

    expect(dec2026.NIGHT).toEqual(["2026-12-15", "2026-12-16", "2026-12-21"]);
    expect(jan2027.MORNING).toEqual(["2027-01-04", "2027-01-05", "2027-01-06"]);
    expect(jan2027.NIGHT).toEqual(["2027-01-18", "2027-01-19", "2027-01-20"]);
  });
});

describe("getEligibleMaintenanceEmployees", () => {
  const roster: RosterData = {
    fileName: "Schedule_2026_11.json",
    month: 10, // Nov (0-based)
    year: 2026,
    employees: ["Alice", "Bob", "Carol", "Dave"],
    dateColumns: [
      { index: 1, date: "02-Nov", isoDate: "2026-11-02" },
      { index: 15, date: "16-Nov", isoDate: "2026-11-16" },
    ],
    rows: {
      Alice: { "2026-11-02": "M", "2026-11-16": "OFF" },
      Bob: { "2026-11-02": "M", "2026-11-16": "N" },
      Carol: { "2026-11-02": "A", "2026-11-16": "N" },
      Dave: { "2026-11-02": "MID", "2026-11-16": "M" },
    },
  };

  it("selects M shift employees for MORNING and N shift employees for NIGHT", () => {
    expect(
      getEligibleMaintenanceEmployees(roster, "2026-11-02", "MORNING")
    ).toEqual(["Alice", "Bob"]);
    expect(
      getEligibleMaintenanceEmployees(roster, "2026-11-16", "NIGHT")
    ).toEqual(["Bob", "Carol"]);
  });

  it("returns empty array when roster is null", () => {
    expect(
      getEligibleMaintenanceEmployees(null, "2026-11-02", "MORNING")
    ).toEqual([]);
  });
});

describe("generateMaintenanceOccurrencesForMonth", () => {
  it("generates deterministic occurrenceIds and skips disabled tasks for new occurrences", () => {
    const tasks: MaintenanceTask[] = [
      makeTask({ id: "t-morning", title: "Generator Test", window: "MORNING" }),
      makeTask({
        id: "t-night",
        title: "Firewall Patch",
        window: "NIGHT",
        enabled: true,
      }),
      makeTask({
        id: "t-disabled",
        title: "Deprecated Check",
        window: "MORNING",
        enabled: false,
      }),
    ];

    const occurrences = generateMaintenanceOccurrencesForMonth({
      year: 2026,
      month1Based: 11,
      tasks,
    });

    expect(occurrences).toHaveLength(6);
    expect(occurrences.map((o) => o.occurrenceId)).toEqual([
      buildMaintenanceOccurrenceId("t-morning", "2026-11-02", "MORNING"),
      buildMaintenanceOccurrenceId("t-morning", "2026-11-03", "MORNING"),
      buildMaintenanceOccurrenceId("t-morning", "2026-11-04", "MORNING"),
      buildMaintenanceOccurrenceId("t-night", "2026-11-16", "NIGHT"),
      buildMaintenanceOccurrenceId("t-night", "2026-11-17", "NIGHT"),
      buildMaintenanceOccurrenceId("t-night", "2026-11-18", "NIGHT"),
    ]);
    expect(occurrences.every((o) => o.status === "pending")).toBe(true);
    expect(occurrences.every((o) => o.completionCount === 0)).toBe(true);
  });

  it("tracks multi-employee completions, completionCount, and overall status", () => {
    const task = makeTask({ id: "t-1", title: "Chiller Check", window: "MORNING" });
    const occId = buildMaintenanceOccurrenceId("t-1", "2026-11-02", "MORNING");

    const completions: TaskCompletion[] = [
      makeCompletion({
        id: "c-2",
        occurrenceId: occId,
        taskId: "t-1",
        taskTitle: "Chiller Check",
        scheduledDate: "2026-11-02",
        window: "MORNING",
        completedBy: "Bob",
        completedAt: "2026-11-02T09:00:00.000Z",
      }),
      makeCompletion({
        id: "c-1",
        occurrenceId: occId,
        taskId: "t-1",
        taskTitle: "Chiller Check",
        scheduledDate: "2026-11-02",
        window: "MORNING",
        completedBy: "Alice",
        completedAt: "2026-11-02T07:30:00.000Z",
      }),
    ];

    const occurrences = generateMaintenanceOccurrencesForMonth({
      year: 2026,
      month1Based: 11,
      tasks: [task],
      completions,
    });

    const nov2 = occurrences.find((o) => o.scheduledDate === "2026-11-02");
    const nov3 = occurrences.find((o) => o.scheduledDate === "2026-11-03");

    expect(nov2).toBeDefined();
    expect(nov2?.status).toBe("completed");
    expect(nov2?.completionCount).toBe(2);
    expect(nov2?.completions.map((c) => c.completedBy)).toEqual(["Alice", "Bob"]);

    expect(nov3?.status).toBe("pending");
    expect(nov3?.completionCount).toBe(0);
    expect(nov3?.completions).toEqual([]);
  });

  it("preserves historical completions when a task is disabled, renamed, or deleted", () => {
    const disabledTask = makeTask({
      id: "t-disabled",
      title: "New Renamed Title",
      window: "MORNING",
      enabled: false,
    });

    const disabledCompletion = makeCompletion({
      id: "c-disabled",
      occurrenceId: buildMaintenanceOccurrenceId(
        "t-disabled",
        "2026-11-02",
        "MORNING"
      ),
      taskId: "t-disabled",
      taskTitle: "Old Original Title",
      scheduledDate: "2026-11-02",
      window: "MORNING",
      completedBy: "Alice",
    });

    const deletedCompletion = makeCompletion({
      id: "c-deleted",
      occurrenceId: buildMaintenanceOccurrenceId(
        "t-deleted",
        "2026-11-16",
        "NIGHT"
      ),
      taskId: "t-deleted",
      taskTitle: "Deleted Night Task",
      scheduledDate: "2026-11-16",
      window: "NIGHT",
      completedBy: "Carol",
      completedAt: "2026-11-16T23:10:00.000Z",
    });

    const occurrences = generateMaintenanceOccurrencesForMonth({
      year: 2026,
      month1Based: 11,
      tasks: [disabledTask],
      completions: [disabledCompletion, deletedCompletion],
    });

    // Only the 2 historical completed occurrences should appear (no new pending ones for disabledTask)
    expect(occurrences).toHaveLength(2);
    expect(occurrences[0]).toMatchObject({
      taskId: "t-disabled",
      taskTitle: "Old Original Title",
      scheduledDate: "2026-11-02",
      window: "MORNING",
      status: "completed",
      completionCount: 1,
    });
    expect(occurrences[1]).toMatchObject({
      taskId: "t-deleted",
      taskTitle: "Deleted Night Task",
      scheduledDate: "2026-11-16",
      window: "NIGHT",
      status: "completed",
      completionCount: 1,
    });
  });

  it("generates occurrences across Dec -> Jan range", () => {
    const task = makeTask({ id: "t-range", title: "Monthly Check", window: "NIGHT" });
    const rangeOccurrences = generateMaintenanceOccurrencesForRange({
      from: "2026-12-16",
      to: "2027-01-19",
      tasks: [task],
    });

    expect(rangeOccurrences.map((o) => o.scheduledDate)).toEqual([
      "2026-12-16",
      "2026-12-21",
      "2027-01-18",
      "2027-01-19",
    ]);
  });
});
