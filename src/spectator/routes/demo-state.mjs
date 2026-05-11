import { demoLoadedInProc, demoState, estimateCurrentTick } from "../state/demo.mjs";
import { gsiState } from "../state/gsi.mjs";
import { playingState } from "../reporters/demo-playing.mjs";
import { sendJson } from "../util/http.mjs";

export async function demoStateHandler(_req, res) {
  const gsiFresh =
    gsiState.lastReceivedMs > 0 &&
    Date.now() - gsiState.lastReceivedMs < 30_000;
  const demoLoaded =
    gsiFresh && gsiState.mapPhase != null ? true : await demoLoadedInProc();
  sendJson(res, 200, {
    tick: estimateCurrentTick(),
    total_ticks: demoState.totalTicks,
    tick_rate: demoState.tickRate,
    rate: demoState.rate,
    paused: demoState.paused,
    last_activity_ms_ago: Date.now() - demoState.lastActivityMs,
    demo_loaded: demoLoaded,
    gsi: gsiFresh
      ? {
          map_name: gsiState.mapName,
          map_phase: gsiState.mapPhase,
          round_phase: gsiState.roundPhase,
          round_number: gsiState.roundNumber,
          spectated_steam_id: gsiState.spectatedSteamId,
          last_received_ms_ago: Date.now() - gsiState.lastReceivedMs,
          spec_slots: gsiState.specSlots,
          team_ct_name: gsiState.teamCtName,
          team_t_name:  gsiState.teamTName,
          team_ct_score: gsiState.teamCtScore,
          team_t_score:  gsiState.teamTScore,
          demoui_hidden: playingState.demouiHidden,
        }
      : null,
  });
}
