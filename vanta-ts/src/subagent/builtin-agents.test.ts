import { describe, it, expect } from "vitest";
import {
  BUILTIN_AGENTS,
  DEFAULT_AGENT_TYPE,
  resolveBuiltinAgent,
  agentToolFilter,
  type BuiltinAgentType,
} from "./builtin-agents.js";

// A representative slice of the real child registry: read/inspection tools, the
// reasoning tools, the run/check tools, plus direct-mutation + delegation tools.
const REGISTRY = [
  "read_file",
  "grep_files",
  "glob_files",
  "code_search",
  "inspect_state",
  "todo",
  "clarify",
  "shell_cmd",
  "regression_lock",
  "write_file",
  "edit_file",
  "run_code",
  "git_commit",
  "delegate",
] as const;

describe("BUILTIN_AGENTS registry", () => {
  it("registers the five built-in types", () => {
    expect(Object.keys(BUILTIN_AGENTS).sort()).toEqual(
      ["explore", "general-purpose", "plan", "verification"].sort(),
    );
  });

  it("every type has a name, description, and non-empty persona", () => {
    for (const [key, type] of Object.entries(BUILTIN_AGENTS)) {
      expect(type.name).toBe(key);
      expect(type.description.length).toBeGreaterThan(0);
      expect(type.persona.length).toBeGreaterThan(0);
    }
  });

  it("is frozen (read-only source of truth)", () => {
    expect(Object.isFrozen(BUILTIN_AGENTS)).toBe(true);
  });
});

describe("resolveBuiltinAgent", () => {
  it("resolves each named type to itself", () => {
    for (const name of ["explore", "plan", "verification", "general-purpose"]) {
      expect(resolveBuiltinAgent(name).name).toBe(name);
    }
  });

  it("is forgiving about case + surrounding whitespace", () => {
    expect(resolveBuiltinAgent("  Explore ").name).toBe("explore");
    expect(resolveBuiltinAgent("VERIFICATION").name).toBe("verification");
  });

  it("falls back to general-purpose for an unknown type", () => {
    expect(resolveBuiltinAgent("nope").name).toBe(DEFAULT_AGENT_TYPE);
    expect(resolveBuiltinAgent("nope").name).toBe("general-purpose");
  });

  it("falls back to general-purpose for empty / undefined / null", () => {
    expect(resolveBuiltinAgent("").name).toBe("general-purpose");
    expect(resolveBuiltinAgent("   ").name).toBe("general-purpose");
    expect(resolveBuiltinAgent(undefined).name).toBe("general-purpose");
    expect(resolveBuiltinAgent(null).name).toBe("general-purpose");
  });
});

describe("agentToolFilter — explore (read-only)", () => {
  const explore = resolveBuiltinAgent("explore");

  it("keeps only the read-only inspection tools", () => {
    expect(agentToolFilter(explore, REGISTRY)).toEqual([
      "read_file",
      "grep_files",
      "glob_files",
      "code_search",
      "inspect_state",
    ]);
  });

  it("excludes write_file and shell_cmd (no mutation, no execution)", () => {
    const allowed = agentToolFilter(explore, REGISTRY);
    expect(allowed).not.toContain("write_file");
    expect(allowed).not.toContain("edit_file");
    expect(allowed).not.toContain("shell_cmd");
    expect(allowed).not.toContain("run_code");
    expect(allowed).not.toContain("delegate");
  });
});

describe("agentToolFilter — plan (read + reason, no-mutate, no recursion)", () => {
  const plan = resolveBuiltinAgent("plan");

  it("keeps read-only + reasoning tools", () => {
    const allowed = agentToolFilter(plan, REGISTRY);
    expect(allowed).toContain("read_file");
    expect(allowed).toContain("todo");
    expect(allowed).toContain("clarify");
  });

  it("excludes mutation tools and delegate (no recursion)", () => {
    const allowed = agentToolFilter(plan, REGISTRY);
    expect(allowed).not.toContain("write_file");
    expect(allowed).not.toContain("shell_cmd");
    expect(allowed).not.toContain("delegate");
  });
});

describe("agentToolFilter — verification (read + run/check, no broad writes)", () => {
  const verification = resolveBuiltinAgent("verification");

  it("allows shell_cmd and regression_lock", () => {
    const allowed = agentToolFilter(verification, REGISTRY);
    expect(allowed).toContain("shell_cmd");
    expect(allowed).toContain("regression_lock");
  });

  it("excludes broad writes (write_file / edit_file)", () => {
    const allowed = agentToolFilter(verification, REGISTRY);
    expect(allowed).not.toContain("write_file");
    expect(allowed).not.toContain("edit_file");
  });

  it("still has the read-only floor", () => {
    const allowed = agentToolFilter(verification, REGISTRY);
    expect(allowed).toContain("read_file");
    expect(allowed).toContain("grep_files");
  });
});

describe("agentToolFilter — general-purpose (all)", () => {
  const general = resolveBuiltinAgent("general-purpose");

  it("keeps every present tool (full set)", () => {
    expect(agentToolFilter(general, REGISTRY)).toEqual([...REGISTRY]);
  });

  it("unknown/omitted type resolves here and also gets the full set", () => {
    expect(agentToolFilter(resolveBuiltinAgent("???"), REGISTRY)).toEqual([...REGISTRY]);
  });
});

describe("agentToolFilter — present-name + allow/deny semantics", () => {
  it("only returns tools that are actually present (absent allowlisted = no-op)", () => {
    const explore = resolveBuiltinAgent("explore");
    // read_file is present, grep_files is absent from this registry.
    expect(agentToolFilter(explore, ["read_file", "write_file"])).toEqual(["read_file"]);
  });

  it("never grants an unknown tool (allowlist is closed)", () => {
    const explore = resolveBuiltinAgent("explore");
    expect(agentToolFilter(explore, ["totally_new_tool"])).toEqual([]);
  });

  it("preserves present-name order and dedupes a repeated name", () => {
    const general = resolveBuiltinAgent("general-purpose");
    expect(agentToolFilter(general, ["read_file", "todo", "read_file"])).toEqual([
      "read_file",
      "todo",
    ]);
  });

  it("returns an empty list for an empty registry", () => {
    expect(agentToolFilter(resolveBuiltinAgent("explore"), [])).toEqual([]);
    expect(agentToolFilter(resolveBuiltinAgent("general-purpose"), [])).toEqual([]);
  });

  it("denyTools removes a name even when the allowlist would keep it", () => {
    const type: BuiltinAgentType = {
      name: "t",
      description: "d",
      allowTools: ["read_file", "delegate"],
      denyTools: ["delegate"],
      persona: "p",
    };
    expect(agentToolFilter(type, REGISTRY)).toEqual(["read_file"]);
  });

  it("denyTools also subtracts from an allow:'all' type", () => {
    const type: BuiltinAgentType = {
      name: "t",
      description: "d",
      allowTools: "all",
      denyTools: ["git_commit"],
      persona: "p",
    };
    const allowed = agentToolFilter(type, REGISTRY);
    expect(allowed).not.toContain("git_commit");
    expect(allowed).toContain("read_file");
    expect(allowed).toContain("write_file");
  });
});
