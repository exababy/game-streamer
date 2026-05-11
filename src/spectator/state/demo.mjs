import { DEMO_FILE, DEMO_TICK_RATE, DEMO_TOTAL_TICKS } from "../env.mjs";
import { run } from "../util/run.mjs";
import { findCs2Window } from "../cs2/window.mjs";

export const demoState = {
  lastTickAtSeek: 0,
  lastSeekRealMs: Date.now(),
  rate: 1,
  paused: false,
  totalTicks: DEMO_TOTAL_TICKS,
  tickRate: DEMO_TICK_RATE,
  lastActivityMs: Date.now(),
};

export function bumpActivity() {
  demoState.lastActivityMs = Date.now();
}

export function estimateCurrentTick() {
  if (demoState.paused) return demoState.lastTickAtSeek;
  const elapsedSec = (Date.now() - demoState.lastSeekRealMs) / 1000;
  return Math.max(
    0,
    Math.round(demoState.lastTickAtSeek + elapsedSec * demoState.rate * demoState.tickRate),
  );
}

// cs2 keeps the .dem file open via fd for the entire playback, so
// presence in /proc/<pid>/fd/ is a reliable "demo is loaded" signal.
export async function demoLoadedInProc() {
  const wid = await findCs2Window();
  if (!wid) return false;
  const r = await run(["pgrep", "-f", "/linuxsteamrt64/cs2"]);
  if (r.code !== 0) return false;
  const pid = r.stdout.trim().split("\n")[0];
  if (!pid) return false;
  try {
    const fs = await import("node:fs/promises");
    const fdDir = `/proc/${pid}/fd`;
    for (const e of await fs.readdir(fdDir)) {
      try {
        if ((await fs.readlink(`${fdDir}/${e}`)) === DEMO_FILE) return true;
      } catch { /* fd closed between readdir and readlink */ }
    }
  } catch { /* /proc/<pid>/fd gone */ }
  return false;
}
