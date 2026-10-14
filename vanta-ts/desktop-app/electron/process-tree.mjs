import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const DEFAULT_GRACE_MS = 4000;
const POLL_MS = 100;

/** Parse `ps -axo pid=,ppid=` output into {pid, ppid} rows. */
export function parseProcessTable(text) {
  const rows = [];
  for (const line of String(text).split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(\d+)/);
    if (match) rows.push({ pid: Number(match[1]), ppid: Number(match[2]) });
  }
  return rows;
}

/** Every transitive child of `rootPid` (not the root itself), deepest first. */
export function collectDescendants(rootPid, table) {
  const found = [];
  const seen = new Set([rootPid]);
  const queue = [rootPid];
  while (queue.length > 0) {
    const parent = queue.shift();
    for (const row of table) {
      if (row.ppid === parent && !seen.has(row.pid)) {
        seen.add(row.pid);
        found.push(row.pid);
        queue.push(row.pid);
      }
    }
  }
  return found.reverse();
}

async function readProcessTable() {
  if (process.platform === "win32") return [];
  try {
    const { stdout } = await run("ps", ["-axo", "pid=,ppid="], { timeout: 3000 });
    return parseProcessTable(stdout);
  } catch {
    return [];
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

const hasExited = (child) => child.exitCode != null || child.signalCode != null;

async function until(check, timeoutMs, sleep) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= deadline) return false;
    await sleep(POLL_MS);
  }
  return true;
}

/**
 * Stop a child we spawned together with everything it spawned. Descendants are recorded before the
 * signal (afterwards they are reparented and unfindable), the child gets SIGTERM so it can run its
 * own cleanup, and whatever is still alive after the grace period is SIGKILLed.
 * Resolves with the pids that needed SIGKILL; never rejects.
 */
export async function stopProcessTree(child, options = {}) {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const readTable = options.readTable ?? readProcessTable;
  const alive = options.isAlive ?? isAlive;
  // The root goes through the ChildProcess so Node tracks `killed`; descendants are plain pids.
  const kill = options.kill ?? ((pid, signal) => (pid === child.pid && child.kill ? child.kill(signal) : process.kill(pid, signal)));
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const rootPid = child.pid;
  const descendants = rootPid && !hasExited(child) ? collectDescendants(rootPid, await readTable()) : [];
  const rootAlive = () => (rootPid ? alive(rootPid) : false);
  const tryKill = (pid, signal) => {
    try { kill(pid, signal); } catch { /* already gone */ }
  };
  if (!hasExited(child)) {
    if (rootPid) tryKill(rootPid, "SIGTERM");
    else child.kill?.("SIGTERM");
  }
  const targets = [...(rootPid ? [rootPid] : []), ...descendants];
  const gone = await until(() => !rootAlive() && descendants.every((pid) => !alive(pid)), graceMs, sleep);
  if (gone) return { forced: [] };
  const forced = targets.filter((pid) => alive(pid));
  for (const pid of forced) tryKill(pid, "SIGKILL");
  await until(() => forced.every((pid) => !alive(pid)), graceMs, sleep);
  return { forced };
}
