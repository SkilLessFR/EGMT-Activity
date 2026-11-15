import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROULETTE_ITEMS,
  computeScheduledMaintenanceStatus,
} from "../src/domain/scheduledMaintenance";
import type { ScheduledMaintenanceLog } from "../src/shared/types";

describe("scheduledMaintenance domain (Roulette-Tracker logic)", () => {
  it("includes the 6 default roulettes from Roulette-Tracker with A25.2 not in use", () => {
    expect(DEFAULT_ROULETTE_ITEMS.map((r) => r.id)).toEqual([
      "A25.1",
      "A25.2",
      "A25.3",
      "RA31.1",
      "RA 31.3",
      "R5.1",
    ]);
    const a252 = DEFAULT_ROULETTE_ITEMS.find((r) => r.id === "A25.2");
    expect(a252?.inUse).toBe(false);
    expect(a252?.cycleDays).toBe(5);
  });

  it("computes not_in_use, grey, green, amber, and red statuses with lastChangedBy", () => {
    const a251 = DEFAULT_ROULETTE_ITEMS[0];
    const a252 = DEFAULT_ROULETTE_ITEMS[1];

    expect(
      computeScheduledMaintenanceStatus(a252, [], "2026-11-15T10:00:00.000Z").status
    ).toBe("not_in_use");

    expect(
      computeScheduledMaintenanceStatus(a251, [], "2026-11-15T10:00:00.000Z").status
    ).toBe("grey");

    const logs: ScheduledMaintenanceLog[] = [
      {
        id: "log-1",
        itemId: "A25.1",
        itemName: "A25.1",
        location: "Afi",
        changedAt: "2026-11-10T10:00:00.000Z",
        changedBy: "Alex P",
        createdAt: "2026-11-10T10:00:00.000Z",
      },
    ];

    // Nov 12 -> 3 days remaining -> green
    const greenRes = computeScheduledMaintenanceStatus(
      a251,
      logs,
      "2026-11-12T10:00:00.000Z"
    );
    expect(greenRes.status).toBe("green");
    expect(greenRes.daysRemaining).toBe(3);
    expect(greenRes.lastLog?.changedBy).toBe("Alex P");

    // Nov 14 -> 1 day remaining (within warningDays=1) -> amber
    expect(
      computeScheduledMaintenanceStatus(a251, logs, "2026-11-14T10:00:00.000Z").status
    ).toBe("amber");

    // Nov 16 -> -1 days remaining -> red
    const redRes = computeScheduledMaintenanceStatus(
      a251,
      logs,
      "2026-11-16T10:00:00.000Z"
    );
    expect(redRes.status).toBe("red");
    expect(redRes.daysRemaining).toBe(-1);
  });
});
