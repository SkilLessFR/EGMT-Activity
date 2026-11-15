import type { KVNamespace } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import { onRequestGet, onRequestPost } from "../functions/api/completions/index";
import type { Env } from "../functions/api/_lib/kv";
import type {
  CompletionsListResponse,
  CreateCompletionResponse,
} from "../src/shared/types";

class InMemoryKV {
  public store = new Map<string, string>();

  async get(key: string, type?: string): Promise<unknown> {
    const val = this.store.get(key);
    if (val === undefined) return null;
    return type === "json" ? JSON.parse(val) : val;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async list(options?: { prefix?: string; cursor?: string }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }> {
    const prefix = options?.prefix ?? "";
    const keys = Array.from(this.store.keys())
      .filter((k) => k.startsWith(prefix))
      .sort()
      .map((name) => ({ name }));
    return { keys, list_complete: true };
  }
}

function makeEnv(kv: InMemoryKV): Env {
  return { EGMT_ACTIVIT: kv as unknown as KVNamespace };
}

function makePostContext(env: Env, body: unknown) {
  return {
    request: new Request("https://example.com/api/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  } as unknown as Parameters<typeof onRequestPost>[0];
}

function makeGetContext(env: Env, query = "") {
  return {
    request: new Request(`https://example.com/api/completions${query}`, {
      method: "GET",
    }),
    env,
  } as unknown as Parameters<typeof onRequestGet>[0];
}

describe("completions API (/api/completions)", () => {
  it("DAILY: completes once (ANY rule), stores full snapshot, and rejects duplicate with 409", async () => {
    const kv = new InMemoryKV();
    const env = makeEnv(kv);

    const payload = {
      occurrenceId: "daily:t1:2026-11-15:08:00",
      taskId: "t1",
      taskType: "DAILY",
      taskTitle: "Check Boiler Pressure",
      scheduledDate: "2026-11-15",
      scheduledTime: "08:00",
      completedBy: "Palade Alexandru-Ionut",
    };

    const res1 = await onRequestPost(makePostContext(env, payload));
    expect(res1.status).toBe(201);
    const data1 = (await res1.json()) as CreateCompletionResponse;
    expect(data1.completion.taskType).toBe("DAILY");
    expect(data1.completion.taskTitle).toBe("Check Boiler Pressure");
    expect(data1.completion.scheduledDate).toBe("2026-11-15");
    expect(data1.completion.scheduledTime).toBe("08:00");
    expect(data1.completion.completedBy).toBe("Palade Alexandru-Ionut");
    expect(data1.completion.completedAt).toBeTruthy();

    // Stored inside monthly index completions:month:YYYY-MM under completion:daily:YYYY-MM:<occurrenceId>
    const monthRaw = kv.store.get("completions:month:2026-11");
    expect(monthRaw).toBeTruthy();
    const monthMap = JSON.parse(monthRaw!) as Record<string, unknown>;
    expect("completion:daily:2026-11:daily:t1:2026-11-15:08:00" in monthMap).toBe(true);

    // Second completion for same occurrenceId (even by another employee) -> 409 Conflict
    const res2 = await onRequestPost(
      makePostContext(env, {
        ...payload,
        completedBy: "Toma Mihai",
      })
    );
    expect(res2.status).toBe(409);
  });

  it("MAINTENANCE: allows multiple employees, rejects duplicate by SAME employee with 409", async () => {
    const kv = new InMemoryKV();
    const env = makeEnv(kv);

    const basePayload = {
      occurrenceId: "maint:m1:2026-11-02:MORNING",
      taskId: "m1",
      taskType: "MAINTENANCE",
      taskTitle: "Server Patching",
      scheduledDate: "2026-11-02",
      window: "MORNING",
    };

    const res1 = await onRequestPost(
      makePostContext(env, { ...basePayload, completedBy: "Toma Mihai" })
    );
    expect(res1.status).toBe(201);
    const data1 = (await res1.json()) as CreateCompletionResponse;
    expect(data1.completion.window).toBe("MORNING");

    // Different employee on same occurrenceId -> 201
    const res2 = await onRequestPost(
      makePostContext(env, {
        ...basePayload,
        completedBy: "Olteanu Ionut-Lucian",
      })
    );
    expect(res2.status).toBe(201);

    // Same employee (different case/whitespace) on same occurrenceId -> 409
    const res3 = await onRequestPost(
      makePostContext(env, { ...basePayload, completedBy: "  toma mihai  " })
    );
    expect(res3.status).toBe(409);

    // Verify monthly index entries use completion:maintenance:YYYY-MM:<occurrenceId>:<employeeKey>
    const monthRaw = kv.store.get("completions:month:2026-11");
    expect(monthRaw).toBeTruthy();
    const monthMap = JSON.parse(monthRaw!) as Record<string, unknown>;
    expect(
      "completion:maintenance:2026-11:maint:m1:2026-11-02:MORNING:toma%20mihai" in
        monthMap
    ).toBe(true);
    expect(
      "completion:maintenance:2026-11:maint:m1:2026-11-02:MORNING:olteanu%20ionut-lucian" in
        monthMap
    ).toBe(true);
  });

  it("GET /api/completions filters by month, date, and taskType", async () => {
    const kv = new InMemoryKV();
    const env = makeEnv(kv);

    await onRequestPost(
      makePostContext(env, {
        occurrenceId: "daily:t1:2026-11-15:08:00",
        taskId: "t1",
        taskType: "DAILY",
        taskTitle: "Daily 1",
        scheduledDate: "2026-11-15",
        scheduledTime: "08:00",
        completedBy: "Toma Mihai",
      })
    );
    await onRequestPost(
      makePostContext(env, {
        occurrenceId: "maint:m1:2026-11-02:MORNING",
        taskId: "m1",
        taskType: "MAINTENANCE",
        taskTitle: "Maint 1",
        scheduledDate: "2026-11-02",
        window: "MORNING",
        completedBy: "Toma Mihai",
      })
    );

    const monthRes = await onRequestGet(makeGetContext(env, "?month=2026-11"));
    expect(monthRes.status).toBe(200);
    const monthData = (await monthRes.json()) as CompletionsListResponse;
    expect(monthData.completions).toHaveLength(2);

    const dateRes = await onRequestGet(
      makeGetContext(env, "?date=2026-11-15")
    );
    expect(dateRes.status).toBe(200);
    const dateData = (await dateRes.json()) as CompletionsListResponse;
    expect(dateData.completions).toHaveLength(1);
    expect(dateData.completions[0].taskType).toBe("DAILY");

    const typeRes = await onRequestGet(
      makeGetContext(env, "?month=2026-11&taskType=MAINTENANCE")
    );
    expect(typeRes.status).toBe(200);
    const typeData = (await typeRes.json()) as CompletionsListResponse;
    expect(typeData.completions).toHaveLength(1);
    expect(typeData.completions[0].taskType).toBe("MAINTENANCE");
  });

  it("rejects invalid completion payloads with 400", async () => {
    const kv = new InMemoryKV();
    const env = makeEnv(kv);

    // Missing scheduledTime for DAILY
    const res1 = await onRequestPost(
      makePostContext(env, {
        occurrenceId: "daily:t1:2026-11-15:08:00",
        taskId: "t1",
        taskType: "DAILY",
        taskTitle: "Daily 1",
        scheduledDate: "2026-11-15",
        completedBy: "Toma Mihai",
      })
    );
    expect(res1.status).toBe(400);

    // Missing window for MAINTENANCE
    const res2 = await onRequestPost(
      makePostContext(env, {
        occurrenceId: "maint:m1:2026-11-02:MORNING",
        taskId: "m1",
        taskType: "MAINTENANCE",
        taskTitle: "Maint 1",
        scheduledDate: "2026-11-02",
        completedBy: "Toma Mihai",
      })
    );
    expect(res2.status).toBe(400);
  });
});
