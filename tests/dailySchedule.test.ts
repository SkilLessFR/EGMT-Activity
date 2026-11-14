import { describe, expect, it } from "vitest";
import {
  buildDailyOccurrenceId,
  computeDailyOccurrenceStatus,
  generateDailyOccurrences,
  getActiveShiftsAtTime,
  getEligibleEmployeesForDailyTask,
  groupDailyOccurrences,
} from "../src/domain/dailySchedule";
import type {
  DailyTask,
  RosterData,
  TaskCompletion,
} from "../src/shared/types";

function makeRoster(
  year: number,
  month0Based: number,
  rows: RosterData["rows"]
): RosterData {
  const employees = Object.keys(rows);
  return {
    fileName: `Schedule_${year}_${String(month0Based + 1).padStart(2, "0")}.json`,
    month: month0Based,
    year,
    employees,
    dateColumns: [],
    rows,
  };
}

function makeTask(overrides: Partial<DailyTask> & { id: string }): DailyTask {
  return {
    title: `Task ${overrides.id}`,
    targetShift: "M",
    schedule: { type: "daily" },
    times: ["08:00"],
    enabled: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("dailySchedule", () => {
  describe("buildDailyOccurrenceId", () => {
    it("deterministically encodes taskId, scheduledDate, and scheduledTime", () => {
      const id1 = buildDailyOccurrenceId("task-1", "2026-11-15", "09:30");
      const id2 = buildDailyOccurrenceId("task-1", "2026-11-15", "09:30");
      const id3 = buildDailyOccurrenceId("task-1", "2026-11-15", "14:00");
      expect(id1).toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id1).toContain("task-1");
      expect(id1).toContain("2026-11-15");
      expect(id1).toContain("09:30");
    });
  });

  describe("schedule matching & multiple times & disabled", () => {
    it("handles once, daily, weekly (0=Sun..6=Sat), multiple times, and skips disabled tasks", () => {
      // 2026-11-15 is a Sunday (0)
      // 2026-11-16 is a Monday (1)
      const tasks: DailyTask[] = [
        makeTask({
          id: "once-match",
          title: "Once Match",
          schedule: { type: "once", date: "2026-11-15" },
          times: ["18:00", "08:00"],
        }),
        makeTask({
          id: "once-miss",
          title: "Once Miss",
          schedule: { type: "once", date: "2026-11-16" },
          times: ["10:00"],
        }),
        makeTask({
          id: "daily-1",
          title: "Daily Task",
          schedule: { type: "daily" },
          times: ["12:00"],
        }),
        makeTask({
          id: "weekly-sun",
          title: "Sunday Check",
          schedule: { type: "weekly", daysOfWeek: [0, 3] },
          times: ["09:00"],
        }),
        makeTask({
          id: "weekly-mon",
          title: "Monday Check",
          schedule: { type: "weekly", daysOfWeek: [1] },
          times: ["09:00"],
        }),
        makeTask({
          id: "disabled-1",
          title: "Disabled Task",
          schedule: { type: "daily" },
          times: ["07:00"],
          enabled: false,
        }),
      ];

      const occurrences = generateDailyOccurrences({
        tasks,
        selectedDate: "2026-11-15",
        completions: [],
      });

      expect(occurrences.map((o) => `${o.taskId}@${o.scheduledTime}`)).toEqual([
        "once-match@08:00",
        "weekly-sun@09:00",
        "daily-1@12:00",
        "once-match@18:00",
      ]);
    });
  });

  describe("active shifts and roster eligibility", () => {
    const novRoster = makeRoster(2026, 10, {
      "Alice M": { "2026-11-15": "M", "2026-11-16": "M", "2026-11-30": "OFF" },
      "Bob MID": { "2026-11-15": "MID", "2026-11-16": "MID", "2026-11-30": "MID" },
      "Carol A": { "2026-11-15": "A", "2026-11-16": "A", "2026-11-30": "A" },
      "Dan N": { "2026-11-15": "N", "2026-11-16": "OFF", "2026-11-30": "N" },
      "Eve N": { "2026-11-15": "OFF", "2026-11-16": "N", "2026-11-30": "OFF" },
    });

    const decRoster = makeRoster(2026, 11, {
      "Alice M": { "2026-12-01": "M" },
      "Dan N": { "2026-12-01": "OFF" },
      "Eve N": { "2026-12-01": "N" },
    });

    it("detects active shifts at boundary and overlap times", () => {
      expect(getActiveShiftsAtTime("02:00")).toEqual([
        { shift: "N", usePreviousDay: true },
      ]);
      expect(getActiveShiftsAtTime("05:59")).toEqual([
        { shift: "N", usePreviousDay: true },
      ]);
      expect(getActiveShiftsAtTime("06:00")).toEqual([
        { shift: "M", usePreviousDay: false },
      ]);
      expect(getActiveShiftsAtTime("09:00")).toEqual([
        { shift: "M", usePreviousDay: false },
        { shift: "MID", usePreviousDay: false },
      ]);
      expect(getActiveShiftsAtTime("13:59")).toEqual([
        { shift: "M", usePreviousDay: false },
        { shift: "MID", usePreviousDay: false },
      ]);
      expect(getActiveShiftsAtTime("14:00")).toEqual([
        { shift: "MID", usePreviousDay: false },
        { shift: "A", usePreviousDay: false },
      ]);
      expect(getActiveShiftsAtTime("16:59")).toEqual([
        { shift: "MID", usePreviousDay: false },
        { shift: "A", usePreviousDay: false },
      ]);
      expect(getActiveShiftsAtTime("17:00")).toEqual([
        { shift: "A", usePreviousDay: false },
      ]);
      expect(getActiveShiftsAtTime("22:00")).toEqual([
        { shift: "N", usePreviousDay: false },
      ]);
    });

    it("handles M/MID (09:00-14:00) and A/MID (14:00-17:00) overlaps for ALL_ACTIVE", () => {
      expect(
        getEligibleEmployeesForDailyTask({
          targetShift: "ALL_ACTIVE",
          scheduledDate: "2026-11-15",
          scheduledTime: "07:00",
          currentRoster: novRoster,
        })
      ).toEqual(["Alice M"]);

      expect(
        getEligibleEmployeesForDailyTask({
          targetShift: "ALL_ACTIVE",
          scheduledDate: "2026-11-15",
          scheduledTime: "10:00",
          currentRoster: novRoster,
        })
      ).toEqual(["Alice M", "Bob MID"]);

      expect(
        getEligibleEmployeesForDailyTask({
          targetShift: "ALL_ACTIVE",
          scheduledDate: "2026-11-15",
          scheduledTime: "15:00",
          currentRoster: novRoster,
        })
      ).toEqual(["Bob MID", "Carol A"]);

      expect(
        getEligibleEmployeesForDailyTask({
          targetShift: "ALL_ACTIVE",
          scheduledDate: "2026-11-15",
          scheduledTime: "19:00",
          currentRoster: novRoster,
        })
      ).toEqual(["Carol A"]);
    });

    it("uses previous day's N roster between 00:00 and 05:59 within the same month", () => {
      // On 2026-11-16 at 02:30, Dan N (who started N on 2026-11-15) is active, NOT Eve N
      expect(
        getEligibleEmployeesForDailyTask({
          targetShift: "N",
          scheduledDate: "2026-11-16",
          scheduledTime: "02:30",
          currentRoster: novRoster,
        })
      ).toEqual(["Dan N"]);

      expect(
        getEligibleEmployeesForDailyTask({
          targetShift: "ALL_ACTIVE",
          scheduledDate: "2026-11-16",
          scheduledTime: "04:00",
          currentRoster: novRoster,
        })
      ).toEqual(["Dan N"]);

      // On 2026-11-16 at 22:30, Eve N (starting N on 2026-11-16) is active
      expect(
        getEligibleEmployeesForDailyTask({
          targetShift: "N",
          scheduledDate: "2026-11-16",
          scheduledTime: "22:30",
          currentRoster: novRoster,
        })
      ).toEqual(["Eve N"]);
    });

    it("uses previous month's roster on the 1st of a month between 00:00 and 05:59", () => {
      // On 2026-12-01 at 03:00, N shift comes from 2026-11-30 in previousRoster (Dan N)
      expect(
        getEligibleEmployeesForDailyTask({
          targetShift: "N",
          scheduledDate: "2026-12-01",
          scheduledTime: "03:00",
          currentRoster: decRoster,
          previousRoster: novRoster,
        })
      ).toEqual(["Dan N"]);

      // On 2026-12-01 at 22:15, N shift comes from 2026-12-01 in currentRoster (Eve N)
      expect(
        getEligibleEmployeesForDailyTask({
          targetShift: "ALL_ACTIVE",
          scheduledDate: "2026-12-01",
          scheduledTime: "22:15",
          currentRoster: decRoster,
          previousRoster: novRoster,
        })
      ).toEqual(["Eve N"]);
    });
  });

  describe("occurrence status & grouping", () => {
    it("computes overdue, dueNow, upcoming, and completed accurately", () => {
      const dummyCompletion: TaskCompletion = {
        id: "c1",
        occurrenceId: "occ-done",
        taskId: "t-done",
        taskType: "DAILY",
        taskTitle: "Done",
        scheduledDate: "2026-11-15",
        scheduledTime: "08:00",
        completedBy: "Alice M",
        completedAt: "2026-11-15T06:05:00.000Z",
      };

      expect(
        computeDailyOccurrenceStatus({
          scheduledDate: "2026-11-14",
          scheduledTime: "23:00",
          completion: null,
          nowDate: "2026-11-15",
          nowTime: "09:15",
        })
      ).toBe("overdue");

      expect(
        computeDailyOccurrenceStatus({
          scheduledDate: "2026-11-16",
          scheduledTime: "01:00",
          completion: null,
          nowDate: "2026-11-15",
          nowTime: "09:15",
        })
      ).toBe("upcoming");

      expect(
        computeDailyOccurrenceStatus({
          scheduledDate: "2026-11-15",
          scheduledTime: "08:00",
          completion: null,
          nowDate: "2026-11-15",
          nowTime: "09:15",
          dueWindowMinutes: 30,
        })
      ).toBe("overdue");

      expect(
        computeDailyOccurrenceStatus({
          scheduledDate: "2026-11-15",
          scheduledTime: "09:00",
          completion: null,
          nowDate: "2026-11-15",
          nowTime: "09:15",
          dueWindowMinutes: 30,
        })
      ).toBe("dueNow");

      expect(
        computeDailyOccurrenceStatus({
          scheduledDate: "2026-11-15",
          scheduledTime: "09:30",
          completion: null,
          nowDate: "2026-11-15",
          nowTime: "09:15",
          dueWindowMinutes: 30,
        })
      ).toBe("upcoming");

      expect(
        computeDailyOccurrenceStatus({
          scheduledDate: "2026-11-15",
          scheduledTime: "08:00",
          completion: dummyCompletion,
          nowDate: "2026-11-15",
          nowTime: "09:15",
        })
      ).toBe("completed");
    });

    it("groups generated occurrences into overdue, dueNow, upcoming, completed", () => {
      const tasks: DailyTask[] = [
        makeTask({ id: "t1", title: "Overdue", times: ["07:00"] }),
        makeTask({ id: "t2", title: "Due Now", times: ["09:00"] }),
        makeTask({ id: "t3", title: "Upcoming", times: ["15:00"] }),
        makeTask({ id: "t4", title: "Completed", times: ["06:30"] }),
      ];

      const completedOccId = buildDailyOccurrenceId("t4", "2026-11-15", "06:30");
      const completions: TaskCompletion[] = [
        {
          id: "c4",
          occurrenceId: completedOccId,
          taskId: "t4",
          taskType: "DAILY",
          taskTitle: "Completed",
          scheduledDate: "2026-11-15",
          scheduledTime: "06:30",
          completedBy: "Alice M",
          completedAt: "2026-11-15T04:35:00.000Z",
        },
      ];

      const occurrences = generateDailyOccurrences({
        tasks,
        selectedDate: "2026-11-15",
        completions,
        nowDate: "2026-11-15",
        nowTime: "09:10",
        dueWindowMinutes: 30,
      });

      const grouped = groupDailyOccurrences(occurrences);
      expect(grouped.overdue.map((o) => o.taskId)).toEqual(["t1"]);
      expect(grouped.dueNow.map((o) => o.taskId)).toEqual(["t2"]);
      expect(grouped.upcoming.map((o) => o.taskId)).toEqual(["t3"]);
      expect(grouped.completed.map((o) => o.taskId)).toEqual(["t4"]);
    });
  });
});
