import {
  KEY_DEMO_SKIP_BACK,
  KEY_DEMO_SKIP_FWD,
  KEY_DEMO_TOGGLE,
  KEY_XRAY_TOGGLE,
  SPEED_KEY_BY_RATE,
} from "../constants.mjs";
import { execCfgCommand } from "../cs2/exec-cfg.mjs";
import { sendKey } from "../cs2/input.mjs";
import { bumpActivity, demoState, estimateCurrentTick } from "../state/demo.mjs";
import { loadRoundTicks } from "../state/bindings.mjs";
import { resetPlayingState } from "../reporters/demo-playing.mjs";
import { sendJson } from "../util/http.mjs";

export async function toggleHandler(_req, res) {
  const ok = await sendKey(KEY_DEMO_TOGGLE);
  if (ok) {
    demoState.paused = !demoState.paused;
    if (demoState.paused) demoState.lastTickAtSeek = estimateCurrentTick();
    demoState.lastSeekRealMs = Date.now();
    bumpActivity();
  }
  sendJson(res, ok ? 200 : 503, ok ? { ok, paused: demoState.paused } : { error: "cs2 not running" });
}

export async function pauseHandler(_req, res) {
  const ok = await execCfgCommand("demo_pause");
  if (ok) {
    demoState.lastTickAtSeek = estimateCurrentTick();
    demoState.paused = true;
    demoState.lastSeekRealMs = Date.now();
    bumpActivity();
  }
  sendJson(res, ok ? 200 : 503, ok ? { ok, paused: true } : { error: "cs2 not running" });
}

export async function resumeHandler(_req, res) {
  const ok = await execCfgCommand("demo_resume");
  if (ok) {
    demoState.paused = false;
    demoState.lastSeekRealMs = Date.now();
    bumpActivity();
  }
  sendJson(res, ok ? 200 : 503, ok ? { ok, paused: false } : { error: "cs2 not running" });
}

export async function seekHandler(_req, res, body) {
  const tick = Number.parseInt(body.tick, 10);
  if (!Number.isFinite(tick) || tick < 0) {
    sendJson(res, 400, { error: "tick (non-negative int) required" });
    return;
  }
  let cmd = `demo_gototick ${tick}`;
  let nextPaused = demoState.paused;
  if (body.pause_after === true)  { cmd = `demo_gototick ${tick} 0 1`; nextPaused = true;  }
  if (body.pause_after === false) { cmd = `demo_gototick ${tick} 0 0`; nextPaused = false; }
  const ok = await execCfgCommand(cmd);
  if (ok) {
    demoState.lastTickAtSeek = tick;
    demoState.lastSeekRealMs = Date.now();
    demoState.paused = nextPaused;
    bumpActivity();
  }
  sendJson(res, ok ? 200 : 503, ok ? { ok, tick, paused: nextPaused } : { error: "cs2 not running" });
}

export async function skipHandler(_req, res, body) {
  const secs = Number.parseFloat(body.secs);
  if (!Number.isFinite(secs)) {
    sendJson(res, 400, { error: "secs (number) required" });
    return;
  }
  let ok, via;
  if (secs === -15 || secs === 15) {
    const key = secs < 0 ? KEY_DEMO_SKIP_BACK : KEY_DEMO_SKIP_FWD;
    ok = await sendKey(key);
    via = `key:${key}`;
  } else {
    const target = Math.max(0, estimateCurrentTick() + Math.round(secs * demoState.tickRate));
    ok = await execCfgCommand(`demo_gototick ${target}`);
    via = "exec-cfg";
  }
  if (ok) {
    demoState.lastTickAtSeek = Math.max(
      0,
      estimateCurrentTick() + Math.round(secs * demoState.tickRate),
    );
    demoState.lastSeekRealMs = Date.now();
    bumpActivity();
  }
  sendJson(res, ok ? 200 : 503, ok ? { ok, secs, via } : { error: "cs2 not running" });
}

export async function speedHandler(_req, res, body) {
  const rate = Number.parseFloat(body.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    sendJson(res, 400, { error: "rate (positive number) required" });
    return;
  }
  // host_timescale > 8 destabilises cs2's tick + audio sync.
  const clamped = Math.min(8, Math.max(0.1, rate));
  demoState.lastTickAtSeek = estimateCurrentTick();
  demoState.lastSeekRealMs = Date.now();
  const presetKey = SPEED_KEY_BY_RATE[String(clamped)];
  const ok = presetKey
    ? await sendKey(presetKey)
    : await execCfgCommand(`host_timescale ${clamped}`);
  if (ok) {
    demoState.rate = clamped;
    bumpActivity();
  }
  sendJson(res, ok ? 200 : 503,
    ok ? { ok, rate: clamped, via: presetKey ? "key" : "console" } : { error: "cs2 not running" },
  );
}

export async function reloadHandler(_req, res) {
  const ok = await execCfgCommand(`playdemo /tmp/game-streamer/demo.dem`);
  if (ok) {
    demoState.lastTickAtSeek = 0;
    demoState.lastSeekRealMs = Date.now();
    demoState.paused = false;
    resetPlayingState();
    bumpActivity();
  }
  sendJson(res, ok ? 200 : 503, ok ? { ok } : { error: "cs2 not running" });
}

export async function xrayHandler(_req, res, body) {
  const ok = await sendKey(KEY_XRAY_TOGGLE);
  if (ok) bumpActivity();
  sendJson(res, ok ? 200 : 503, ok ? { ok, enabled: Boolean(body.enabled) } : { error: "cs2 not running" });
}

export async function demouiHandler(_req, res) {
  const ok = await sendKey("F11");
  if (ok) bumpActivity();
  sendJson(res, ok ? 200 : 503, ok ? { ok } : { error: "cs2 not running" });
}

export async function roundHandler(_req, res, body) {
  const round = Number.parseInt(body.round, 10);
  if (!Number.isFinite(round) || round < 1) {
    sendJson(res, 400, { error: "round (int >= 1) required" });
    return;
  }
  const entry = loadRoundTicks().find((r) => r.round === round);
  if (!entry) {
    sendJson(res, 404, { error: `no tick mapping for round ${round}` });
    return;
  }
  const ok = await execCfgCommand(`demo_gototick ${entry.start_tick}`);
  if (ok) {
    demoState.lastTickAtSeek = entry.start_tick;
    demoState.lastSeekRealMs = Date.now();
    bumpActivity();
  }
  sendJson(res, ok ? 200 : 503, ok ? { ok, round, tick: entry.start_tick } : { error: "cs2 not running" });
}

export async function execHandler(_req, res, body) {
  const cmd = typeof body.cmd === "string" ? body.cmd : "";
  if (!cmd.trim()) {
    sendJson(res, 400, { error: "cmd (string) required" });
    return;
  }
  const ok = await execCfgCommand(cmd);
  bumpActivity();
  sendJson(res, ok ? 200 : 503, ok ? { ok } : { error: "cs2 not running" });
}
