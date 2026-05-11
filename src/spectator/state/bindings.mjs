import { readFileSync } from "node:fs";

import { DEMO_ROUND_TICKS_PATH, PLAYER_BINDINGS_PATH } from "../env.mjs";

export function loadPlayerBindings() {
  try {
    const parsed = JSON.parse(readFileSync(PLAYER_BINDINGS_PATH, "utf8"));
    return parsed?.accountid_to_key ?? {};
  } catch {
    return {};
  }
}

export function loadRoundTicks() {
  try {
    const raw = readFileSync(DEMO_ROUND_TICKS_PATH, "utf8").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
