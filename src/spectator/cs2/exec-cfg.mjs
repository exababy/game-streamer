import { writeFileSync, renameSync } from "node:fs";
import process from "node:process";

import { EXEC_CFG_KEY } from "../constants.mjs";
import { EXEC_CFG_PATH } from "../env.mjs";
import { run } from "../util/run.mjs";
import { findCs2Window } from "./window.mjs";
import { sendConsoleCommand } from "./input.mjs";

// Serialized so two in-flight calls can't race the cfg rename
// against BACKSPACE delivery and have cs2 read the wrong contents.
let execCfgChain = Promise.resolve();

export async function execCfgCommand(cmd) {
  const prev = execCfgChain;
  let release;
  execCfgChain = new Promise((r) => { release = r; });
  try {
    await prev.catch(() => undefined);
    return await execCfgCommandImpl(cmd);
  } finally {
    setTimeout(release, 30);
  }
}

async function execCfgCommandImpl(cmd) {
  if (!EXEC_CFG_PATH) return sendConsoleCommand(cmd);
  if ((await findCs2Window()) === null) return false;
  // One cmd per line — `;`-joined lines get mis-parsed across cs2 builds.
  const lines = cmd.split(";").map((s) => s.trim()).filter(Boolean);
  const body = lines.join("\n") + "\n";
  try {
    const tmp = `${EXEC_CFG_PATH}.tmp`;
    writeFileSync(tmp, body, "utf8");
    renameSync(tmp, EXEC_CFG_PATH);
  } catch (err) {
    process.stderr.write(
      `[spec-server] exec-cfg write failed (${(err && err.message) || err})\n`,
    );
    return sendConsoleCommand(cmd);
  }
  await run(["xdotool", "key", "--clearmodifiers", EXEC_CFG_KEY]);
  return true;
}
