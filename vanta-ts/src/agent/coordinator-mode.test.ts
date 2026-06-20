import { describe, it, expect } from "vitest";
import {
  COORDINATOR_EXCLUDED_TOOLS,
  coordinatorEnabled,
  coordinatorToolExclusions,
  coordinatorPersona,
} from "./coordinator-mode.js";

// A representative slice of the real registry: delegation + read/inspection tools
// that MUST stay, plus direct-mutation/execution tools that MUST be excluded.
const DELEGATION_AND_READ = [
  "delegate",
  "swarm",
  "read_file",
  "grep_files",
  "glob_files",
  "inspect_state",
  "todo",
  "clarify",
  "code_search",
] as const;

const MUTATION = [
  "write_file",
  "edit_file",
  "shell_cmd",
  "run_code",
  "git_commit",
  "git_push",
  "browser_act",
  "gmail_send",
] as const;

describe("coordinatorEnabled", () => {
  it("is on only when VANTA_COORDINATOR=1", () => {
    expect(coordinatorEnabled({ VANTA_COORDINATOR: "1" })).toBe(true);
  });

  it("is off by default (unset) = current behavior", () => {
    expect(coordinatorEnabled({})).toBe(false);
  });

  it("is off for any non-1 value (0, true, empty)", () => {
    expect(coordinatorEnabled({ VANTA_COORDINATOR: "0" })).toBe(false);
    expect(coordinatorEnabled({ VANTA_COORDINATOR: "true" })).toBe(false);
    expect(coordinatorEnabled({ VANTA_COORDINATOR: "" })).toBe(false);
  });
});

describe("coordinatorToolExclusions", () => {
  it("excludes every direct-mutation / execution tool present", () => {
    const exclusions = coordinatorToolExclusions([...MUTATION, ...DELEGATION_AND_READ]);
    for (const tool of MUTATION) expect(exclusions).toContain(tool);
  });

  it("keeps delegation + read/inspection tools (never excluded)", () => {
    const exclusions = coordinatorToolExclusions([...MUTATION, ...DELEGATION_AND_READ]);
    for (const tool of DELEGATION_AND_READ) expect(exclusions).not.toContain(tool);
  });

  it("excludes git writes but keeps read-only git tools", () => {
    const exclusions = coordinatorToolExclusions([
      "git_status",
      "git_diff",
      "git_commit",
      "git_push",
      "git_branch",
      "git_checkout",
    ]);
    expect(exclusions).toEqual(["git_commit", "git_push", "git_branch", "git_checkout"]);
    expect(exclusions).not.toContain("git_status");
    expect(exclusions).not.toContain("git_diff");
  });

  it("leaves an unknown tool available (only the denylist is excluded)", () => {
    const exclusions = coordinatorToolExclusions(["totally_new_tool", "write_file"]);
    expect(exclusions).toContain("write_file");
    expect(exclusions).not.toContain("totally_new_tool");
  });

  it("returns no exclusions when no mutation tools are present", () => {
    expect(coordinatorToolExclusions([...DELEGATION_AND_READ])).toEqual([]);
  });

  it("returns an empty list for an empty tool set", () => {
    expect(coordinatorToolExclusions([])).toEqual([]);
  });

  it("only ever returns names from the well-known denylist", () => {
    const exclusions = coordinatorToolExclusions([...MUTATION, ...DELEGATION_AND_READ]);
    for (const name of exclusions) expect(COORDINATOR_EXCLUDED_TOOLS).toContain(name);
  });
});

describe("coordinatorToolExclusions — broader categories", () => {
  it("preserves input order and dedupes a repeated mutation name", () => {
    const exclusions = coordinatorToolExclusions(["git_push", "write_file", "git_push"]);
    expect(exclusions).toEqual(["git_push", "write_file"]);
  });

  it("excludes outbound comms + actuation + self-mutation tools", () => {
    const exclusions = coordinatorToolExclusions([
      "send_message",
      "calendar_create",
      "drive_update",
      "vision_action",
      "lan_control",
      "self_repair",
      "regression_lock",
      "write_skill",
      "cron_create",
      "roadmap_move",
    ]);
    expect(exclusions).toHaveLength(10);
  });
});

describe("coordinatorPersona", () => {
  it("names the lead/orchestrator delegate-and-verify role", () => {
    const persona = coordinatorPersona();
    expect(persona).toMatch(/lead agent|orchestrator/i);
    expect(persona).toMatch(/delegate/i);
    expect(persona).toMatch(/verify/i);
  });

  it("tells the agent not to do the execution work itself", () => {
    expect(coordinatorPersona()).toMatch(/not to do the work yourself/i);
  });

  it("is a deterministic, non-empty note", () => {
    expect(coordinatorPersona()).toBe(coordinatorPersona());
    expect(coordinatorPersona().length).toBeGreaterThan(0);
  });
});
