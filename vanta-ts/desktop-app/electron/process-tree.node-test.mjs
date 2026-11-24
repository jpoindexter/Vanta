import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { collectDescendants, parseProcessTable, stopProcessTree } from "./process-tree.mjs";

test("parses ps output and ignores noise", () => {
  assert.deepEqual(parseProcessTable("  10   1\n 11  10\ngarbage\n\n"), [{ pid: 10, ppid: 1 }, { pid: 11, ppid: 10 }]);
});

test("collects transitive children deepest first and never the root or siblings", () => {
  const table = [{ pid: 2, ppid: 1 }, { pid: 3, ppid: 2 }, { pid: 4, ppid: 3 }, { pid: 9, ppid: 1 }, { pid: 5, ppid: 9 }];
  assert.deepEqual(collectDescendants(2, table), [4, 3]);
});

test("SIGKILLs only what survived the grace period", async () => {
  const signals = [];
  const dead = new Set();
  const child = { pid: 20, exitCode: null, signalCode: null };
  const result = await stopProcessTree(child, {
    graceMs: 30,
    readTable: async () => [{ pid: 21, ppid: 20 }],
    isAlive: (pid) => !dead.has(pid),
    kill: (pid, signal) => { signals.push([pid, signal]); if (signal === "SIGTERM" && pid === 20) dead.add(20); if (signal === "SIGKILL") dead.add(pid); },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, Math.min(ms, 5))),
  });
  assert.deepEqual(signals, [[20, "SIGTERM"], [21, "SIGKILL"]]);
  assert.deepEqual(result.forced, [21]);
});

test("real processes: parent and grandchild both end, and a stray process is untouched", async () => {
  const parentSrc = `const { spawn } = require("node:child_process");
    const g = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
    console.log(g.pid); process.on("SIGTERM", () => {}); setInterval(()=>{},1000);`;
  const stray = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  const parent = spawn(process.execPath, ["-e", parentSrc], { stdio: ["ignore", "pipe", "ignore"] });
  const grandchild = Number(await new Promise((resolve) => parent.stdout.once("data", (d) => resolve(String(d).trim()))));
  const exited = new Promise((resolve) => parent.once("exit", resolve));
  try {
    const result = await stopProcessTree(parent, { graceMs: 400 });
    await exited;
    assert.ok(result.forced.includes(parent.pid), "parent ignores SIGTERM, so it needed SIGKILL");
    assert.throws(() => process.kill(grandchild, 0), /ESRCH/);
    assert.doesNotThrow(() => process.kill(stray.pid, 0));
  } finally {
    stray.kill("SIGKILL");
    try { process.kill(grandchild, "SIGKILL"); } catch { /* gone */ }
  }
});
