import { DISPLAY } from "../env.mjs";
import { directorState } from "../director/index.mjs";
import { gsiState } from "../state/gsi.mjs";
import { loadPlayerBindings } from "../state/bindings.mjs";
import { findCs2Window } from "../cs2/window.mjs";
import { sendJson } from "../util/http.mjs";

export async function healthHandler(_req, res) {
  const wid = await findCs2Window();
  const bindings = loadPlayerBindings();
  sendJson(res, 200, {
    ok: true,
    display: DISPLAY,
    cs2_window: wid,
    cs2_running: wid !== null,
    player_bindings: Object.keys(bindings).length,
    director: {
      enabled: directorState.enabled,
      target_steam_id: directorState.targetSteamId,
      target_since_ms: directorState.targetSinceMs,
      gsi_players: gsiState.players.size,
    },
  });
}
