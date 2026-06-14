import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Interface as Readline } from "node:readline/promises";

// Mock the heavy steps so the orchestration is testable without prompts/IO.
vi.mock("./setup.js", () => ({ runSetup: vi.fn(async () => true), envPath: vi.fn(() => "/nonexistent/.env") }));
vi.mock("./setup-messaging.js", () => ({ runMessagingSetup: vi.fn(async () => true) }));
vi.mock("./brain/store.js", () => ({ writeRegion: vi.fn(async () => {}) }));
vi.mock("./repl/health-cmd.js", () => ({ gatherCapabilities: vi.fn(async () => []), formatHealth: vi.fn(() => "  CAPS-OK") }));

import { runFullSetup, isYes, box, wizardBanner, sectionHeader, configLocation, summaryText } from "./setup-full.js";
import { runSetup } from "./setup.js";
import { runMessagingSetup } from "./setup-messaging.js";
import { writeRegion } from "./brain/store.js";

const mockedRunSetup = vi.mocked(runSetup);
const mockedMessaging = vi.mocked(runMessagingSetup);
const mockedWriteRegion = vi.mocked(writeRegion);

/** Fake readline that returns scripted answers in order. */
function fakeRl(answers: string[]): Readline {
  return { question: vi.fn(async () => answers.shift() ?? ""), close: vi.fn() } as unknown as Readline;
}
const mkEnv = (o: Record<string, string>) => o as NodeJS.ProcessEnv;

beforeEach(() => {
  vi.clearAllMocks();
  mockedRunSetup.mockResolvedValue(true);
});

describe("pure builders", () => {
  it("isYes accepts only y/yes", () => {
    for (const y of ["y", "Y", "yes", " yes "]) expect(isYes(y)).toBe(true);
    for (const n of ["", "n", "no", "nope", "yeah"]) expect(isYes(n)).toBe(false);
  });
  it("box draws corners + contains the content", () => {
    const b = box(["hello"]);
    expect(b).toContain("┌");
    expect(b).toContain("┐");
    expect(b).toContain("└");
    expect(b).toContain("hello");
  });
  it("banner + section header carry the ◆ marker", () => {
    expect(wizardBanner()).toContain("◆ Vanta Setup Wizard");
    expect(sectionHeader("Messaging")).toContain("◆ Messaging");
  });
  it("configLocation shows the file paths", () => {
    const c = configLocation("/repo", mkEnv({ VANTA_HOME: "/home/.vanta" }));
    expect(c).toContain("Configuration Location");
    expect(c).toContain("/home/.vanta");
  });
  it("summary shows files + management commands", () => {
    const s = summaryText("/repo", mkEnv({}));
    expect(s).toContain("📁 Your files");
    expect(s).toContain("vanta config");
  });
});

describe("runFullSetup", () => {
  const env = mkEnv({});

  it("bails when the model step is declined", async () => {
    mockedRunSetup.mockResolvedValue(false);
    expect(await runFullSetup("/repo", fakeRl([]), env)).toBe(false);
    expect(mockedMessaging).not.toHaveBeenCalled();
  });

  it("skips optional steps on no/empty answers", async () => {
    const r = await runFullSetup("/repo", fakeRl(["n", ""]), env); // messaging no, persona empty
    expect(r).toBe(true);
    expect(mockedRunSetup).toHaveBeenCalledOnce();
    expect(mockedMessaging).not.toHaveBeenCalled();
    expect(mockedWriteRegion).not.toHaveBeenCalled();
  });

  it("runs messaging + saves personality when opted in", async () => {
    const r = await runFullSetup("/repo", fakeRl(["y", "be terse"]), env);
    expect(r).toBe(true);
    expect(mockedMessaging).toHaveBeenCalledOnce();
    expect(mockedWriteRegion).toHaveBeenCalledWith("identity", expect.stringContaining("be terse"), { append: true, env });
  });
});
