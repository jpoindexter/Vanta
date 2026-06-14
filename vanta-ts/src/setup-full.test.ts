import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Interface as Readline } from "node:readline/promises";

// Mock the heavy steps so the orchestration is testable without prompts/IO.
vi.mock("./setup.js", () => ({ runSetup: vi.fn(async () => true), envPath: vi.fn(() => "/nonexistent/.env") }));
vi.mock("./setup-messaging.js", () => ({ runMessagingSetup: vi.fn(async () => true) }));
vi.mock("./status.js", () => ({ gatherStatus: vi.fn(async () => ({})), formatStatus: vi.fn(() => "STATUS-OK") }));
vi.mock("./brain/store.js", () => ({ writeRegion: vi.fn(async () => {}) }));

import { runFullSetup, isYes, capabilitiesStep, wizardBanner, sectionHeader, summaryText } from "./setup-full.js";
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
  it("banner + section header carry the ◆ marker", () => {
    expect(wizardBanner()).toContain("◆ Vanta Setup Wizard");
    expect(sectionHeader("Messaging")).toContain("◆ Messaging");
  });
  it("summary shows provider/model, file locations, and management commands", () => {
    const s = summaryText("/repo", mkEnv({ VANTA_PROVIDER: "openai", VANTA_MODEL: "gpt" }));
    expect(s).toContain("Provider: openai");
    expect(s).toContain("vanta setup model");
    expect(s).toContain("vanta config");
  });
});

describe("capabilitiesStep", () => {
  it("reports tools + the configured MCP count", async () => {
    const env = mkEnv({ VANTA_MCP_SERVERS: JSON.stringify({ servers: { foo: { command: "echo" } } }) });
    const out = await capabilitiesStep(env, ".");
    expect(out).toContain("Tools:");
    expect(out).toContain("1 server(s) connected");
  });
  it("reports no MCP when empty", async () => {
    expect(await capabilitiesStep(mkEnv({ VANTA_MCP_SERVERS: '{"servers":{}}' }), ".")).toContain("MCP: none");
  });
});

describe("runFullSetup", () => {
  const env = mkEnv({ VANTA_MCP_SERVERS: '{"servers":{}}' });

  it("bails when the model step is declined", async () => {
    mockedRunSetup.mockResolvedValue(false);
    expect(await runFullSetup("/repo", fakeRl(["2"]), env)).toBe(false); // chose Full, but model declined
    expect(mockedMessaging).not.toHaveBeenCalled();
  });

  it("Quick mode configures the model only, no optional prompts", async () => {
    const r = await runFullSetup("/repo", fakeRl(["1"]), env); // Quick
    expect(r).toBe(true);
    expect(mockedRunSetup).toHaveBeenCalledOnce();
    expect(mockedMessaging).not.toHaveBeenCalled();
    expect(mockedWriteRegion).not.toHaveBeenCalled();
  });

  it("Full mode runs messaging + saves personality when opted in", async () => {
    const r = await runFullSetup("/repo", fakeRl(["2", "y", "be terse"]), env); // Full, messaging yes, persona
    expect(r).toBe(true);
    expect(mockedMessaging).toHaveBeenCalledOnce();
    expect(mockedWriteRegion).toHaveBeenCalledWith("identity", expect.stringContaining("be terse"), { append: true, env });
  });

  it("Full mode skips optionals on no/empty answers", async () => {
    const r = await runFullSetup("/repo", fakeRl(["2", "n", ""]), env); // Full, messaging no, persona empty
    expect(r).toBe(true);
    expect(mockedMessaging).not.toHaveBeenCalled();
    expect(mockedWriteRegion).not.toHaveBeenCalled();
  });
});
