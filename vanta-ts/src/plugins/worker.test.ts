import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PluginPanelRegistry } from "./panels.js";
import { launchPluginWorker, type PluginWorkerHandle } from "./worker.js";
import { loadEnabledPlugins } from "./loader.js";
import { ToolRegistry } from "../tools/registry.js";
import { PluginCommandRegistry } from "./commands.js";
import type { PluginManifest } from "./manifest.js";

const dirs: string[] = [];
const handles: PluginWorkerHandle[] = [];

afterEach(async () => {
  for (const handle of handles.splice(0)) handle.dispose();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("plugin worker host", () => {
  it("runs out of process, denies an ungranted service, schedules a job, and contributes a panel", async () => {
    const dir = await fixtureDir("host");
    const home = join(dir, "home");
    const panels = new PluginPanelRegistry();
    const logs: string[] = [];
    let fireJob: (() => void) | undefined;
    const manifest: PluginManifest = {
      name: "operator",
      version: "1.0.0",
      main: "index.mjs",
      worker: {
        main: "worker.mjs",
        capabilities: ["log.write", "storage.write", "schedule.jobs", "ui.panel"],
      },
    };
    await writeFile(join(dir, "worker.mjs"), WORKER_FIXTURE, "utf8");

    const handle = await launchPluginWorker({
      manifest,
      pluginDir: dir,
      vantaHome: home,
      granted: ["log.write", "schedule.jobs", "ui.panel"],
      panels,
      log: (line) => logs.push(line),
      schedule: (_intervalMs, fire) => { fireJob = fire; return () => { fireJob = undefined; }; },
    });
    handles.push(handle);

    expect(handle.pid).not.toBe(process.pid);
    expect(handle.granted).toEqual(["log.write", "schedule.jobs", "ui.panel"]);
    expect(logs.join("\n")).toContain("denied: capability storage.write is not granted");
    expect(panels.list()).toEqual([expect.objectContaining({ plugin: "operator", id: "status", title: "Worker status" })]);
    expect(panels.list()[0]?.lines).toContain(`worker pid ${handle.pid}`);
    await expect(readFile(join(home, "plugin-data", "operator.json"), "utf8")).rejects.toThrow();

    fireJob?.();
    await waitFor(() => logs.some((line) => line.includes("job heartbeat ran")));
  });

  it("loads a worker through the enabled-plugin loader with operator grants", async () => {
    const root = await fixtureDir("loader-root");
    const home = await fixtureDir("loader-home");
    const pluginDir = join(home, "plugins", "operator");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, "plugin.json"), JSON.stringify({
      name: "operator",
      version: "1.0.0",
      worker: { main: "worker.mjs", capabilities: ["log.write", "schedule.jobs", "ui.panel", "storage.write"] },
    }), "utf8");
    await writeFile(join(pluginDir, "worker.mjs"), WORKER_FIXTURE, "utf8");
    const panels = new PluginPanelRegistry();
    const logs: string[] = [];

    const loaded = await loadEnabledPlugins({
      repoRoot: root,
      registry: new ToolRegistry(),
      commands: new PluginCommandRegistry(),
      settings: { plugins: { enabled: ["operator"], capabilities: { operator: ["log.write", "schedule.jobs", "ui.panel"] } } },
      env: { VANTA_HOME: home },
      panels,
      log: (line) => logs.push(line),
      workerSchedule: () => () => {},
    });
    handles.push(...loaded.workers);

    expect(loaded.loaded).toEqual(["operator"]);
    expect(loaded.diagnostics).toContainEqual(expect.objectContaining({ plugin: "operator", ok: true, message: "worker loaded" }));
    expect(loaded.workers).toHaveLength(1);
    expect(loaded.panels.list()).toHaveLength(1);
  });
});

async function fixtureDir(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `vanta-worker-${name}-`));
  dirs.push(dir);
  return dir;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for worker event");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const WORKER_FIXTURE = String.raw`
import readline from "node:readline";
const pending = new Map();
let sequence = 0;
function send(message) { process.stdout.write(JSON.stringify(message) + "\n"); }
function request(capability, method, params) {
  const id = String(++sequence);
  send({ type: "host.request", id, capability, method, params });
  return new Promise((resolve) => pending.set(id, resolve));
}
const lines = readline.createInterface({ input: process.stdin });
lines.on("line", async (line) => {
  const message = JSON.parse(line);
  if (message.type === "host.response") {
    const resolve = pending.get(message.id);
    pending.delete(message.id);
    resolve?.(message);
    return;
  }
  if (message.type === "init") {
    const denied = await request("storage.write", "set", { key: "escape", value: true });
    await request("log.write", "write", { message: "denied: " + denied.error });
    await request("ui.panel", "register", { panel: { id: "status", title: "Worker status", lines: ["worker pid " + process.pid] } });
    await request("schedule.jobs", "register", { name: "heartbeat", intervalMs: 1000 });
    send({ type: "ready" });
    return;
  }
  if (message.type === "job" && message.name === "heartbeat") {
    await request("log.write", "write", { message: "job heartbeat ran" });
  }
});
lines.on("close", () => process.exit(0));
`;
