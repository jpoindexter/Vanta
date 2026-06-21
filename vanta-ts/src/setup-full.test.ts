import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the heavy steps so the orchestration is testable without prompts/IO.
vi.mock("./setup.js", () => ({ runSetup: vi.fn(async () => true), envPath: vi.fn(() => "/nonexistent/.env"), askLine: vi.fn(async () => ""), setEnv: vi.fn(async () => {}) }));
vi.mock("./setup-messaging.js", () => ({ runMessagingSetup: vi.fn(async () => true) }));
// the capability step dynamic-imports these — stub them so runFullSetup tests do
// no real brew/pane IO (the logic itself is covered in setup/capabilities.test.ts)
vi.mock("./setup/capabilities.js", () => ({
  planCapabilities: vi.fn(() => ({ installCliclick: false, openPanes: [], env: {}, notes: [] })),
  applyCapabilityPlan: vi.fn(async () => {}),
  realBrewInstall: vi.fn(() => ({ ok: true, message: "" })),
}));
vi.mock("./platform/macos-prefs.js", () => ({ openPrivacyPane: vi.fn(() => ({ ok: true, url: "", message: "" })) }));
vi.mock("./cli/control-cmd.js", () => ({ desktopControlDoctor: vi.fn(() => ({ os: "darwin", screencapture: true, cliclick: true, ready: true, notes: [] })) }));
vi.mock("./brain/store.js", () => ({ writeRegion: vi.fn(async () => {}) }));
vi.mock("./repl/health-cmd.js", () => ({ gatherCapabilities: vi.fn(async () => []), formatHealth: vi.fn(() => "  CAPS-OK") }));
vi.mock("./term/select.js", () => ({ select: vi.fn(async () => 1) }));
vi.mock("./setup-sections.js", () => ({ SETTINGS: [], runSettingSection: vi.fn(async () => {}) }));
vi.mock("./setup-tools.js", () => ({ runToolsSection: vi.fn(async () => {}) }));
vi.mock("./setup/assistant.js", () => ({
  probeProvider: vi.fn(async () => ({ ok: true, detail: "model responded" })),
  runGoogleStep: vi.fn(async () => ({ ok: false, detail: "not authorized" })),
  probeMcp: vi.fn(async () => ({ ok: false, detail: "no MCP servers configured" })),
  probeMessaging: vi.fn(async () => ({ ok: false, detail: "no messaging platform configured" })),
}));

import { runFullSetup, isYes, box, wizardBanner, sectionHeader, configLocation, summaryText } from "./setup-full.js";
import { runSetup, askLine } from "./setup.js";
import { runMessagingSetup } from "./setup-messaging.js";
import { writeRegion } from "./brain/store.js";
import { select } from "./term/select.js";
import { probeProvider, runGoogleStep, probeMcp, probeMessaging } from "./setup/assistant.js";

const mRunSetup = vi.mocked(runSetup);
const mMsg = vi.mocked(runMessagingSetup);
const mWrite = vi.mocked(writeRegion);
const mSelect = vi.mocked(select);
const mAsk = vi.mocked(askLine);
const mProbeProvider = vi.mocked(probeProvider);
const mGoogle = vi.mocked(runGoogleStep);
const mMcp = vi.mocked(probeMcp);
const mProbeMessaging = vi.mocked(probeMessaging);
const mkEnv = (o: Record<string, string>) => o as NodeJS.ProcessEnv;

beforeEach(() => {
  vi.clearAllMocks();
  mRunSetup.mockResolvedValue(true);
  mSelect.mockResolvedValue(1); // default: "Skip" messaging
  mAsk.mockResolvedValue("");
});

describe("pure builders", () => {
  it("isYes accepts only y/yes", () => {
    for (const y of ["y", "Y", "yes", " yes "]) expect(isYes(y)).toBe(true);
    for (const n of ["", "n", "no", "nope", "yeah"]) expect(isYes(n)).toBe(false);
  });
  it("box draws corners + content; banner + headers carry ◆", () => {
    expect(box(["hi"])).toContain("┌");
    expect(box(["hi"])).toContain("hi");
    expect(wizardBanner()).toContain("◆ Vanta Setup Wizard");
    expect(sectionHeader("Messaging")).toContain("◆ Messaging");
  });
  it("configLocation + summary show paths and management commands", () => {
    expect(configLocation("/repo", mkEnv({ VANTA_HOME: "/home/.vanta" }))).toContain("/home/.vanta");
    expect(summaryText("/repo", mkEnv({}))).toContain("vanta config");
  });
});

describe("runFullSetup", () => {
  const env = mkEnv({});

  it("bails when the model step is declined", async () => {
    mRunSetup.mockResolvedValue(false);
    expect(await runFullSetup("/repo", env)).toBe(false);
    expect(mMsg).not.toHaveBeenCalled();
  });

  it("skips optional steps (Skip messaging, empty personality)", async () => {
    const r = await runFullSetup("/repo", env);
    expect(r).toBe(true);
    expect(mRunSetup).toHaveBeenCalledOnce();
    expect(mMsg).not.toHaveBeenCalled();
    expect(mWrite).not.toHaveBeenCalled();
  });

  it("runs messaging + saves personality when chosen", async () => {
    mSelect.mockResolvedValue(0); // Connect
    mAsk.mockResolvedValue("be terse");
    const r = await runFullSetup("/repo", env);
    expect(r).toBe(true);
    expect(mMsg).toHaveBeenCalledOnce();
    expect(mWrite).toHaveBeenCalledWith("identity", expect.stringContaining("be terse"), { append: true, env });
  });

  it("wires live setup probes into the guided flow", async () => {
    const env = mkEnv({ BASE: "1" });
    await runFullSetup("/repo", env);
    const opts = mRunSetup.mock.calls[0]?.[1] as { validate: (u: Record<string, string>) => Promise<unknown> };
    await opts.validate({ VANTA_PROVIDER: "ollama", VANTA_MODEL: "qwen2.5:14b" });
    expect(mProbeProvider).toHaveBeenCalledWith(expect.objectContaining({ BASE: "1", VANTA_PROVIDER: "ollama" }));
    expect(mGoogle).toHaveBeenCalledWith(expect.objectContaining({ env }));
    expect(mMcp).toHaveBeenCalledWith(expect.objectContaining({ env, cwd: "/repo" }));
    expect(mProbeMessaging).toHaveBeenCalledWith(env);
  });

  it("treats messaging Esc/skip (≠0) as 'skip' — no messaging launched", async () => {
    mSelect.mockResolvedValue(-1); // Esc on messaging
    const r = await runFullSetup("/repo", env);
    expect(r).toBe(true);
    expect(mMsg).not.toHaveBeenCalled();
  });
});
