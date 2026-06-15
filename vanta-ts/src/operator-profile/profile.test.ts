import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendPreferenceSignal, signalFromApprovalDecision } from "../preferences/signals.js";
import {
  approvalPreferenceFor,
  defaultOperatorProfile,
  detectProfileDrift,
  inferProfileFromPreferenceSignals,
  inferProfileFromSignals,
  loadOperatorProfile,
  operatorProfilePath,
  writeOperatorProfile,
} from "./profile.js";
import type { OperatorProfile } from "./profile.js";

let home: string;
const savedHome = process.env.VANTA_HOME;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-profile-"));
  process.env.VANTA_HOME = home;
});

afterEach(async () => {
  if (savedHome === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = savedHome;
  await rm(home, { recursive: true, force: true });
});

describe("operator profile store", () => {
  it("loads defaults when the profile file is missing", async () => {
    await expect(loadOperatorProfile()).resolves.toEqual(defaultOperatorProfile());
  });

  it("fails closed to defaults when the profile file is corrupt or invalid", async () => {
    await writeFile(operatorProfilePath(), "{ nope", "utf8");
    await expect(loadOperatorProfile()).resolves.toEqual(defaultOperatorProfile());
    await writeFile(operatorProfilePath(), JSON.stringify({ declared: { riskTolerance: "reckless" } }), "utf8");
    await expect(loadOperatorProfile()).resolves.toEqual(defaultOperatorProfile());
  });

  it("write/read round-trips declared, inferred, and approval preferences", async () => {
    const profile: OperatorProfile = {
      ...defaultOperatorProfile(),
      declared: { ...defaultOperatorProfile().declared, riskTolerance: "conservative" },
      inferred: { ...defaultOperatorProfile().inferred, scopeAppetite: "narrow" },
      approvalPreferences: {
        shell_cmd: "always_ask",
        read_file: "never_ask",
      },
    };
    await writeOperatorProfile(profile);
    await expect(loadOperatorProfile()).resolves.toEqual(profile);
  });
});

describe("operator profile inference + drift", () => {
  it("infers conservative/narrow preferences from denied broad or risky signals", () => {
    const inferred = inferProfileFromSignals([
      { toolName: "shell_cmd", action: "run deploy production", approved: false },
      { toolName: "shell_cmd", action: "run rm -rf dist", approved: false },
      { toolName: "read_file", action: "read README.md", approved: true },
    ]);
    expect(inferred.riskTolerance).toBe("conservative");
    expect(inferred.scopeAppetite).toBe("narrow");
  });

  it("reads durable preference signals into profile inference", async () => {
    await appendPreferenceSignal(signalFromApprovalDecision({ approved: false, action: "run deploy production", reason: "kernel", toolName: "shell_cmd" }));
    await appendPreferenceSignal(signalFromApprovalDecision({ approved: false, action: "edit every file", reason: "kernel", toolName: "write_file" }));
    const inferred = await inferProfileFromPreferenceSignals();
    expect(inferred.riskTolerance).toBe("conservative");
    expect(inferred.scopeAppetite).toBe("narrow");
    expect(inferred.confidence).toBeGreaterThan(0);
  });

  it("returns no drift for matching declared and inferred profile", () => {
    const declared = defaultOperatorProfile().declared;
    const drift = detectProfileDrift(declared, { ...declared, confidence: 0.8 });
    expect(drift.hasDrift).toBe(false);
    expect(drift.messages).toEqual([]);
  });

  it("flags risk and scope mismatch beyond threshold", () => {
    const drift = detectProfileDrift(
      { autonomyLevel: "high", scopeAppetite: "broad", detailLevel: "concise", riskTolerance: "aggressive" },
      { autonomyLevel: "medium", scopeAppetite: "narrow", detailLevel: "normal", riskTolerance: "conservative", confidence: 0.9 },
    );
    expect(drift.hasDrift).toBe(true);
    expect(drift.messages.join("\n")).toContain("scope appetite");
    expect(drift.messages.join("\n")).toContain("risk tolerance");
  });
});

describe("approvalPreferenceFor", () => {
  it("always asks for one-way-door requests even with never_ask", () => {
    const profile = { ...defaultOperatorProfile(), approvalPreferences: { shell_cmd: "never_ask" as const } };
    const decision = approvalPreferenceFor(profile, {
      toolName: "shell_cmd",
      action: "run git push --force",
      currentDecision: "allow",
      kernelRisk: "allow",
    });
    expect(decision.decision).toBe("ask");
    expect(decision.reason).toContain("one-way");
  });

  it("always_ask escalates an allowed matching request", () => {
    const profile = { ...defaultOperatorProfile(), approvalPreferences: { read_file: "always_ask" as const } };
    const decision = approvalPreferenceFor(profile, {
      toolName: "read_file",
      action: "read README.md",
      currentDecision: "allow",
      kernelRisk: "allow",
    });
    expect(decision.decision).toBe("ask");
  });

  it("never_ask never loosens kernel ask or block decisions", () => {
    const profile = { ...defaultOperatorProfile(), approvalPreferences: { shell_cmd: "never_ask" as const } };
    const ask = approvalPreferenceFor(profile, { toolName: "shell_cmd", action: "run npm install", currentDecision: "ask", kernelRisk: "ask" });
    const block = approvalPreferenceFor(profile, { toolName: "shell_cmd", action: "run rm -rf .", currentDecision: "block", kernelRisk: "block" });
    expect(ask.decision).toBe("ask");
    expect(block.decision).toBe("block");
  });
});
