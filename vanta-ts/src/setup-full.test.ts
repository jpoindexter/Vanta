import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the heavy steps so the orchestration is testable without prompts/IO.
vi.mock("./setup.js", () => ({ runSetup: vi.fn(async () => true), envPath: vi.fn(() => "/nonexistent/.env"), askLine: vi.fn(async () => "") }));
vi.mock("./setup-messaging.js", () => ({ runMessagingSetup: vi.fn(async () => true) }));
vi.mock("./brain/store.js", () => ({ writeRegion: vi.fn(async () => {}) }));
vi.mock("./repl/health-cmd.js", () => ({ gatherCapabilities: vi.fn(async () => []), formatHealth: vi.fn(() => "  CAPS-OK") }));
vi.mock("./term/select.js", () => ({ select: vi.fn(async () => 1) }));
vi.mock("./setup-sections.js", () => ({ SETTINGS: [], runSettingSection: vi.fn(async () => {}) }));

import { runFullSetup, isYes, box, wizardBanner, sectionHeader, configLocation, summaryText } from "./setup-full.js";
import { runSetup, askLine } from "./setup.js";
import { runMessagingSetup } from "./setup-messaging.js";
import { writeRegion } from "./brain/store.js";
import { select } from "./term/select.js";

const mRunSetup = vi.mocked(runSetup);
const mMsg = vi.mocked(runMessagingSetup);
const mWrite = vi.mocked(writeRegion);
const mSelect = vi.mocked(select);
const mAsk = vi.mocked(askLine);
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

  it("treats messaging Esc/skip (≠0) as 'skip' — no messaging launched", async () => {
    mSelect.mockResolvedValue(-1); // Esc on messaging
    const r = await runFullSetup("/repo", env);
    expect(r).toBe(true);
    expect(mMsg).not.toHaveBeenCalled();
  });
});
