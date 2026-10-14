import { KERNEL_GUARD_MARKER, KERNEL_PID_FILE_VERSION } from "./pid-file.js";

/**
 * Self-contained CommonJS run as `<node|electron-as-node> -e <source> marker pidFile supervisorPid port root bin ...kernelArgs`.
 * It is inlined (not a file) so a packaged runtime needs nothing extra on disk. The guard owns the
 * kernel: it dies with the supervisor (parent change or signal) and takes the kernel with it, which
 * a SIGKILL'd Node parent could never do from its own handlers.
 */
export const KERNEL_GUARD_SOURCE = `
"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const [, marker, pidFile, supervisorArg, portArg, root, bin, ...kernelArgs] = process.argv;
if (marker !== ${JSON.stringify(KERNEL_GUARD_MARKER)}) { process.stderr.write("kernel guard: bad invocation\\n"); process.exit(64); }
const supervisor = Number(supervisorArg);
const POLL_MS = Number(process.env.VANTA_KERNEL_GUARD_POLL_MS) || 1000;
const GRACE_MS = Number(process.env.VANTA_KERNEL_GUARD_GRACE_MS) || 3000;
let stopping = false;
const supervisorGone = () => {
  if (process.ppid !== supervisor) return true;
  try { process.kill(supervisor, 0); return false; } catch (error) { return error.code !== "EPERM"; }
};
if (supervisorGone()) process.exit(0);
const kernel = spawn(bin, kernelArgs, { stdio: "ignore", env: process.env });
kernel.once("error", (error) => { process.stderr.write("kernel guard: cannot start " + bin + ": " + error.message + "\\n"); process.exit(127); });
function writePidFile() {
  const body = JSON.stringify({ version: ${KERNEL_PID_FILE_VERSION}, kernelPid: kernel.pid, guardPid: process.pid, supervisorPid: supervisor, port: Number(portArg), root, kernelBin: bin, startedAt: new Date().toISOString() });
  fs.mkdirSync(require("node:path").dirname(pidFile), { recursive: true });
  fs.writeFileSync(pidFile + "." + process.pid, body, { mode: 0o600 });
  fs.renameSync(pidFile + "." + process.pid, pidFile);
}
function removePidFile() {
  try {
    if (JSON.parse(fs.readFileSync(pidFile, "utf8")).guardPid === process.pid) fs.unlinkSync(pidFile);
  } catch (error) { /* already gone or replaced by a newer guard */ }
}
function stop() {
  if (stopping) return;
  stopping = true;
  if (kernel.exitCode !== null || kernel.signalCode !== null) return;
  kernel.kill("SIGTERM");
  setTimeout(() => { if (kernel.exitCode === null && kernel.signalCode === null) kernel.kill("SIGKILL"); }, GRACE_MS);
}
try { writePidFile(); } catch (error) { process.stderr.write("kernel guard: cannot write " + pidFile + ": " + error.message + "\\n"); stop(); }
kernel.once("exit", (code) => { removePidFile(); process.exit(code === null ? 1 : code); });
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, stop);
process.on("uncaughtException", (error) => { process.stderr.write("kernel guard: " + error.message + "\\n"); stop(); });
setInterval(() => { if (supervisorGone()) stop(); }, POLL_MS);
`;
