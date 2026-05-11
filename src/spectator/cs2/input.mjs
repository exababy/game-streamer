import { run } from "../util/run.mjs";
import { findCs2Window } from "./window.mjs";

// The HUD overlay is built `focusable: false` so cs2 always holds
// focus — xdotool XTest reaches it without windowactivate (which would
// restack cs2 above the overlay and break compositing). XSendEvent
// (`--window`) is filtered by cs2 and dropped.
export async function sendKey(key) {
  if ((await findCs2Window()) === null) return false;
  await run(["xdotool", "key", "--clearmodifiers", key]);
  return true;
}

export async function sendConsoleCommand(cmd) {
  if ((await findCs2Window()) === null) return false;
  await run(["xdotool", "key", "--clearmodifiers", "grave"]);
  await new Promise((r) => setTimeout(r, 80));
  await run(["xdotool", "type", "--delay", "20", cmd]);
  await new Promise((r) => setTimeout(r, 40));
  await run(["xdotool", "key", "--clearmodifiers", "Return"]);
  await new Promise((r) => setTimeout(r, 60));
  await run(["xdotool", "key", "--clearmodifiers", "grave"]);
  return true;
}
