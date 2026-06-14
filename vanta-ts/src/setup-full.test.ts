import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Interface as Readline } from "node:readline/promises";

// Mock the heavy steps so the orchestration is testable without prompts/IO.
vi.mock("./setup.js", () => ({ runSetup: vi.fn(async () => true), envPath: vi.fn(() => "/nonexistent/.env") }));
vi.mock("./setup-messaging.js", () => ({ runMessagingSetup: vi.fn(async () => true) }));
vi.mock("./status.js", () => ({ gatherStatus: vi.fn(async () => ({})), formatStatus: vi.fn(() => "STATUS-OK") }));
vi.mock("./brain/store.js", () => ({ writeRegion: vi.fn(async () => {}) }));

import { runFullSetup, isYes, mcpStep } from "./setup-full.js";
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

describe("isYes", () => {
  it("accepts only y/yes (case-insensitive); everything else is no", () => {
    for (const y of ["y", "Y", "yes", "YES", " yes "]) expect(isYes(y)).toBe(true);
    for (const n of ["", "n", "no", "nope", "yeah", "sure"]) expect(isYes(n)).toBe(false);
  });
});

describe("mcpStep", () => {
  it("reports the configured server count", async () => {
    const env = mkEnv({ VANTA_MCP_SERVERS: JSON.stringify({ servers: { foo: { command: "echo" } } }) });
    expect(await mcpStep(env, ".")).toContain("1 server(s) configured");
  });
  it("reports none when empty", async () => {
    expect(await mcpStep(mkEnv({ VANTA_MCP_SERVERS: '{"servers":{}}' }), ".")).toContain("none configured");
  });
});

describe("runFullSetup", () => {
  const env = mkEnv({ VANTA_MCP_SERVERS: '{"servers":{}}' });

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

  it("runs messaging + appends personality when opted in", async () => {
    const r = await runFullSetup("/repo", fakeRl(["y", "be terse"]), env);
    expect(r).toBe(true);
    expect(mockedMessaging).toHaveBeenCalledOnce();
    expect(mockedWriteRegion).toHaveBeenCalledWith("identity", expect.stringContaining("be terse"), { append: true, env });
  });
});
