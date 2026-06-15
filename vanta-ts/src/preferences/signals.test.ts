import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendPreferenceSignal,
  exportPreferenceSignalsJsonl,
  preferenceSignalsPath,
  readPreferenceSignals,
  signalFromApprovalDecision,
  sanitizePreferenceContext,
} from "./signals.js";

let home: string;
const savedHome = process.env.VANTA_HOME;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-pref-signals-"));
  process.env.VANTA_HOME = home;
});

afterEach(async () => {
  if (savedHome === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = savedHome;
  await rm(home, { recursive: true, force: true });
});

describe("preference signal store", () => {
  it("returns an empty list when the file is missing", async () => {
    await expect(readPreferenceSignals()).resolves.toEqual([]);
  });

  it("append/read round-trips a chosen-vs-rejected pair", async () => {
    const signal = signalFromApprovalDecision({
      approved: true,
      action: "run npm test",
      reason: "kernel",
      sessionId: "s1",
      toolName: "shell_cmd",
    });
    await appendPreferenceSignal(signal);
    await expect(readPreferenceSignals()).resolves.toEqual([signal]);
  });

  it("skips corrupt JSONL lines without crashing", async () => {
    const signal = signalFromApprovalDecision({ approved: false, action: "run deploy production", reason: "kernel", toolName: "shell_cmd" });
    await appendFile(preferenceSignalsPath(), `not json\n${JSON.stringify(signal)}\n{"kind":"bad"}\n`, "utf8");
    await expect(readPreferenceSignals()).resolves.toEqual([signal]);
  });

  it("maps approval allow/deny to chosen-vs-rejected labels", () => {
    const approved = signalFromApprovalDecision({ approved: true, action: "read README.md", reason: "kernel", toolName: "read_file" });
    const denied = signalFromApprovalDecision({ approved: false, action: "run rm -rf dist", reason: "kernel", toolName: "shell_cmd" });
    expect(approved.chosen.label).toBe("allow");
    expect(approved.rejected.label).toBe("deny");
    expect(denied.chosen.label).toBe("deny");
    expect(denied.rejected.label).toBe("allow");
  });

  it("sanitizes obvious secret-looking values and truncates context", () => {
    const context = sanitizePreferenceContext("run TOKEN=abc123456789 password=hunter2 ".repeat(20));
    expect(context).not.toContain("abc123456789");
    expect(context).not.toContain("hunter2");
    expect(context.length).toBeLessThanOrEqual(240);
  });

  it("exports valid JSONL content", async () => {
    await appendPreferenceSignal(signalFromApprovalDecision({ approved: true, action: "read README.md", reason: "kernel", toolName: "read_file" }));
    const exported = await exportPreferenceSignalsJsonl();
    expect(exported.path).toBe(preferenceSignalsPath());
    expect(exported.content.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(exported.content).kind).toBe("approval_decision");
  });
});
