// Process-tree helpers for the boot proof: who a launched app started, how much CPU they used, and cleanup.
import { execFileSync } from "node:child_process";

/** "1:02.34" or "12:01:02" cputime strings from ps, as seconds. */
export function cpuSeconds(text) {
  const parts = text.trim().split(":").map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function snapshot() {
  const rows = execFileSync("ps", ["-axo", "pid=,ppid=,cputime=,rss=,command="], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return rows.split("\n").flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(.*)$/);
    return match ? [{ pid: Number(match[1]), ppid: Number(match[2]), cpu: cpuSeconds(match[3]), rssMb: Math.round(Number(match[4]) / 1024), command: match[5] }] : [];
  });
}

/** The process `root` and everything below it. */
export function descendants(root) {
  const all = snapshot();
  const found = new Set([root]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const proc of all) if (found.has(proc.ppid) && !found.has(proc.pid)) {
      found.add(proc.pid);
      grew = true;
    }
  }
  return all.filter((proc) => found.has(proc.pid));
}

/** Any process (anywhere) whose command line mentions one of `needles`: used to prove nothing was left running. */
export function stragglers(needles) {
  return snapshot().filter((proc) => proc.pid !== process.pid && needles.some((needle) => proc.command.includes(needle)));
}

export function killAll(procs) {
  for (const proc of procs) {
    try {
      process.kill(proc.pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
}

export const loadAverage = () => execFileSync("uptime", { encoding: "utf8" }).trim().replace(/^.*load averages?:\s*/, "");
