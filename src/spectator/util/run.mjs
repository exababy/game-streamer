import { spawn } from "node:child_process";
import process from "node:process";

import { DISPLAY } from "../env.mjs";

export function run(args, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(args[0], args.slice(1), {
      env: { ...process.env, DISPLAY },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (c) => stdoutChunks.push(c));
    child.stderr.on("data", (c) => stderrChunks.push(c));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      });
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: -1, stdout: "", stderr: "" });
    });
  });
}
