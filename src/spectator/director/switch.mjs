import { SLOT_KEYS } from "../constants.mjs";
import { sendKey } from "../cs2/input.mjs";

// Logging happens in director/index.mjs (which has the full decision
// context — priority, reason, kept-vs-switched). This file just
// presses the bound digit/minus/equal key.
export async function switchSpecTo(target) {
  if (typeof target.slot !== "number" || target.slot < 1 || target.slot > 12) {
    return false;
  }
  return sendKey(SLOT_KEYS[target.slot - 1]);
}
