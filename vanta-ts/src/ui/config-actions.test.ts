import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildConfigOverlay, type ConfigView } from "./config-actions.js";
import { loadSettings, localSettingsPath } from "../settings/store.js";

// Verifies the load-bearing persistence path: an action merges its intent into
// .vanta/settings.local.json and the re-derived overlay reflects it. The host
// captures published views (mirrors how use-overlay binds publish to setOverlay).

describe("config-actions — persist + re-derive", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "vanta-config-"));
    await mkdir(join(root, ".vanta"), { recursive: true });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    delete process.env.VANTA_EFFORT_LEVEL;
  });

  function host(seen: ConfigView[]): { publish: (v: ConfigView) => void; isOpen: () => boolean; openCommand: () => void } {
    return { publish: (v) => seen.push(v), isOpen: () => true, openCommand: () => {} };
  }

  it("cycleEffort writes effortLevel to the local scope and re-derives it", async () => {
    const seen: ConfigView[] = [];
    const view = await buildConfigOverlay(root, host(seen));
    expect(view.state.effort).toBe("medium");

    view.onAction({ kind: "cycleEffort" });
    await new Promise((r) => setTimeout(r, 20));

    const persisted = await loadSettings(root, {} as NodeJS.ProcessEnv);
    expect(persisted.effortLevel).toBe("high");
    expect(seen.at(-1)?.state.effort).toBe("high");
  });

  it("toggleGate flips a gate and persists it under gates", async () => {
    const seen: ConfigView[] = [];
    const view = await buildConfigOverlay(root, host(seen));
    view.onAction({ kind: "toggleGate", gate: "antiSlop" }); // default true → false
    await new Promise((r) => setTimeout(r, 20));

    const persisted = await loadSettings(root, {} as NodeJS.ProcessEnv);
    expect(persisted.gates?.antiSlop).toBe(false);
    expect(seen.at(-1)?.state.gates.antiSlop).toBe(false);
  });

  it("a write preserves unrelated keys already in the local scope", async () => {
    await mkdir(join(root, ".vanta"), { recursive: true });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(localSettingsPath(root), JSON.stringify({ blockedTools: ["shell_cmd"] }), "utf8");

    const view = await buildConfigOverlay(root, host([]));
    view.onAction({ kind: "toggleAuto" });
    await new Promise((r) => setTimeout(r, 20));

    const raw = JSON.parse(await readFile(localSettingsPath(root), "utf8"));
    expect(raw.blockedTools).toEqual(["shell_cmd"]); // untouched dangerous field stays
    expect(raw.autoMode.enabled).toBe(true);
  });
});
