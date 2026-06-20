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

  it("loads sshConfigs named connection profiles", async () => {
    await writeFile(join(home, "settings.json"), JSON.stringify({
      sshConfigs: [{ name: "vps", host: "1.2.3.4", user: "deploy", port: 2222 }],
    }));
    const s = await loadSettings(root, env);
    expect(s.sshConfigs?.[0]?.name).toBe("vps");
    expect(s.sshConfigs?.[0]?.host).toBe("1.2.3.4");
  });

  it("drops a settings file whose ssh profile injects a local command", async () => {
    // A ProxyCommand option runs a LOCAL command via ssh, bypassing assessment.
    // The schema rejects it, so the whole (untrusted) settings object is dropped.
    await writeFile(join(home, "settings.json"), JSON.stringify({
      sshConfigs: [{ name: "evil", host: "h", options: ["ProxyCommand=touch /tmp/pwned"] }],
    }));
    const s = await loadSettings(root, env);
    expect(s.sshConfigs).toBeUndefined();
  });

  it("drops a settings file whose ssh profile uses a leading-dash host", async () => {
    await writeFile(join(home, "settings.json"), JSON.stringify({
      sshConfigs: [{ name: "evil", host: "-oProxyCommand=touch /tmp/pwned" }],
    }));
    const s = await loadSettings(root, env);
    expect(s.sshConfigs).toBeUndefined();
  });

  it("loads autoMode settings", async () => {
    await writeFile(join(home, "settings.json"), JSON.stringify({
      autoMode: {
        enabled: true,
        softDeny: true,
        rules: [{ action: "allow", tool: "shell_cmd", pattern: "git status", label: "status check" }],
      },
    }));
    const s = await loadSettings(root, env);
    expect(s.autoMode?.enabled).toBe(true);
    expect(s.autoMode?.rules?.[0]?.label).toBe("status check");
  });

  it("loads plugin allow-list settings", async () => {
    await writeFile(join(home, "settings.json"), JSON.stringify({
      plugins: { enabled: ["echo"], trustProjectPlugins: true },
    }));
    const s = await loadSettings(root, env);
    expect(s.plugins?.enabled).toEqual(["echo"]);
    expect(s.plugins?.trustProjectPlugins).toBe(true);
  });

  it("loads the four git-parity settings", async () => {
    await writeFile(join(home, "settings.json"), JSON.stringify({
      attribution: "Co-Authored-By: Vanta <ops@theft.studio>",
      includeGitInstructions: true,
      prUrlTemplate: "https://github.com/o/r/pull/{PR}",
      respectGitignore: false,
    }));
    const s = await loadSettings(root, env);
    expect(s.attribution).toBe("Co-Authored-By: Vanta <ops@theft.studio>");
    expect(s.includeGitInstructions).toBe(true);
    expect(s.prUrlTemplate).toBe("https://github.com/o/r/pull/{PR}");
    expect(s.respectGitignore).toBe(false);
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

  it("silently drops malformed plugin settings", async () => {
    await writeFile(join(home, "settings.json"), JSON.stringify({ plugins: { enabled: [123] } }));
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
