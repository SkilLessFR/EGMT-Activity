import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDowntimeScheduleFromWorkbooks,
  parseDowntimeWorkbook,
} from "../src/domain/downtimeImporter";

async function loadExcelArrayBuffer(fileName: string): Promise<ArrayBuffer> {
  const fullPath = path.resolve(process.cwd(), fileName);
  const buf = await readFile(fullPath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe("downtimeImporter", () => {
  it("parses both November 2026 Downtime Excel files and merges Phases 1-8", async () => {
    const buf1 = await loadExcelArrayBuffer(
      "DT November 2026 PHASE 1-4 1.xlsx"
    );
    const buf2 = await loadExcelArrayBuffer(
      "DT November 2026 PHASE 5-8 1.xlsx"
    );

    const wb1 = await parseDowntimeWorkbook(
      buf1,
      "DT November 2026 PHASE 1-4 1.xlsx"
    );
    const wb2 = await parseDowntimeWorkbook(
      buf2,
      "DT November 2026 PHASE 5-8 1.xlsx"
    );

    expect(wb1.monthKey).toBe("2026-11");
    expect(wb1.sheets.map((s) => s.phase.phaseNumber)).toEqual([1, 2, 3, 4]);
    expect(wb2.sheets.map((s) => s.phase.phaseNumber)).toEqual([5, 6, 7, 8]);

    // Check skipping Pass rows by default
    const mergedSkipPass = buildDowntimeScheduleFromWorkbooks([wb1, wb2], {
      includePassRows: false,
    });
    expect(mergedSkipPass.schedule.monthKey).toBe("2026-11");
    expect(mergedSkipPass.schedule.phases).toHaveLength(8);
    expect(mergedSkipPass.skippedPassCount).toBeGreaterThan(0);
    expect(mergedSkipPass.schedule.tasks.every((t) => !t.isPass)).toBe(true);
    expect(
      mergedSkipPass.schedule.tasks.every(
        (t) => !/\b(AM|PM)\b/i.test(t.accessInterval)
      )
    ).toBe(true);

    // Check Phase 1 notice banner & team
    const phase1 = mergedSkipPass.schedule.phases.find(
      (p) => p.phaseNumber === 1
    );
    expect(phase1?.scheduledDate).toBe("2026-11-09");
    expect(phase1?.window).toBe("MORNING");
    expect(phase1?.defaultTeam).toEqual(["Bogdan", "Stefan"]);
    expect(phase1?.notices[0]).toContain("UPS maintenance");

    // Check Phase 5 overnight range & Night shift
    const phase5 = mergedSkipPass.schedule.phases.find(
      (p) => p.phaseNumber === 5
    );
    expect(phase5?.scheduledDate).toBe("2026-11-16");
    expect(phase5?.endDate).toBe("2026-11-17");
    expect(phase5?.window).toBe("NIGHT");

    // Check Phase 8 is DAY SHIFT with Toma
    const phase8 = mergedSkipPass.schedule.phases.find(
      (p) => p.phaseNumber === 8
    );
    expect(phase8?.scheduledDate).toBe("2026-11-19");
    expect(phase8?.window).toBe("MORNING");
    expect(phase8?.defaultTeam).toEqual(["Toma"]);

    // Check including Pass rows increases task count and leaves 0 skipped
    const mergedWithPass = buildDowntimeScheduleFromWorkbooks([wb1, wb2], {
      includePassRows: true,
    });
    expect(mergedWithPass.skippedPassCount).toBe(0);
    expect(mergedWithPass.schedule.tasks.length).toBe(
      mergedSkipPass.schedule.tasks.length + mergedSkipPass.skippedPassCount
    );
  });
});
