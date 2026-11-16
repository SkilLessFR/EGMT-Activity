import type { PagesFunction } from "@cloudflare/workers-types";
import { jsonResponse } from "./_lib/http";
import { type Env, KV_KEYS } from "./_lib/kv";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const version =
    (await context.env.EGMT_ACTIVIT.get(KV_KEYS.syncVersion)) ?? "0";
  return jsonResponse({ version }, 200);
};
