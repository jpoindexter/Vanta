import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadSettings,
  applySettingsEnv,
  isToolAllowed,
  isToolBlocked,
  formatSettings,
} from "./store.js";

let root: string;
let home: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-settings-root-"));
  home = await mkdtemp(join(tmpdir(), "vanta-settings-home-"));
  env = { VANTA_HOME: home };
  await mkdir(join(root, ".vanta"), { recursive: true });
});

afterEach(async () => {
  await Promise.all([
    rm(root, { recursive: true }).catch(() => {}),
    rm(home, { recursive: true }).catch(() => {}),
  ]);
});

describe("loadSettings", () => {
  it("returns empty object when no settings files exist", async () => {
    const s = await loadSettings(root, env);
    expect(s).toEqual({});
  });

  it("loads user-level settings", async () => {
    await writeFile(join(home, "settings.json"), JSON.stringify({ allowedTools: ["read_file"] }));
    const s = await loadSettings(root, env);
    expect(s.allowedTools).toContain("read_file");
  });

  it("loads the disableAgentView setting", async () => {
    await writeFile(join(home, "settings.json"), JSON.stringify({ disableAgentView: true }));
    const s = await loadSettings(root, env);
    expect(s.disableAgentView).toBe(true);
  });

  it("project settings override user settings", async () => {
    await writeFile(join(home, "settings.json"), JSON.stringify({ allowedTools: ["read_file"] }));
    await writeFile(join(root, ".vanta", "settings.json"), JSON.stringify({ allowedTools: ["write_file"] }));
    const s = await loadSettings(root, env);
    expect(s.allowedTools).toContain("write_file");
    expect(s.allowedTools).not.toContain("read_file");
  });

  it("local settings override project settings", async () => {
    await writeFile(join(root, ".vanta", "settings.json"), JSON.stringify({ ui: { theme: "dark" } }));
    await writeFile(join(root, ".vanta", "settings.local.json"), JSON.stringify({ ui: { theme: "light" } }));
    const s = await loadSettings(root, env);
    expect(s.ui?.theme).toBe("light");
  });

  it("merges nested objects across scopes", async () => {
    await writeFile(join(home, "settings.json"), JSON.stringify({ gates: { antiSlop: true } }));
    await writeFile(join(root, ".vanta", "settings.json"), JSON.stringify({ gates: { modeDetect: false } }));
    const s = await loadSettings(root, env);
    expect(s.gates?.antiSlop).toBe(true);
    expect(s.gates?.modeDetect).toBe(false);
  });

  it("silently drops invalid settings keys", async () => {
    await writeFile(join(home, "settings.json"), JSON.stringify({ invalidKey: true }));
    const s = await loadSettings(root, env);
    expect(s).toEqual({});
  });
});

describe("applySettingsEnv", () => {
  it("adds env vars from settings to processEnv", () => {
    const pe: NodeJS.ProcessEnv = {};
    applySettingsEnv({ env: { VANTA_SPINNER: "dots" } }, pe);
    expect(pe.VANTA_SPINNER).toBe("dots");
  });

  it("does not overwrite existing env vars", () => {
    const pe: NodeJS.ProcessEnv = { VANTA_SPINNER: "pulse" };
    applySettingsEnv({ env: { VANTA_SPINNER: "dots" } }, pe);
    expect(pe.VANTA_SPINNER).toBe("pulse");
  });
});

describe("isToolAllowed / isToolBlocked", () => {
  it("returns true for allowed tool", () => {
    expect(isToolAllowed("read_file", { allowedTools: ["read_file"] })).toBe(true);
  });

  it("returns false for unlisted tool", () => {
    expect(isToolAllowed("shell_cmd", { allowedTools: ["read_file"] })).toBe(false);
  });

  it("detects blocked tools", () => {
    expect(isToolBlocked("shell_cmd", { blockedTools: ["shell_cmd"] })).toBe(true);
  });
});

describe("formatSettings", () => {
  it("shows empty message when no settings", () => {
    expect(formatSettings({}, "user")).toContain("empty");
  });

  it("formats settings as indented JSON", () => {
    const s = formatSettings({ allowedTools: ["read_file"] }, "user");
    expect(s).toContain("allowedTools");
  });
});
