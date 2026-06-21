import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  parseAgentDef,
  listAgentDefs,
  resolveAgentType,
  defaultAgentDirs,
  isCustomAgentDef,
  type AgentDefsDeps,
  type CustomAgentDef,
} from "./agent-defs.js";
import { resolveBuiltinAgent, DEFAULT_AGENT_TYPE } from "./builtin-agents.js";

/** Build injected deps from an in-memory {dir → {file → text}} map. */
function fakeDeps(
  dirs: string[],
  files: Record<string, Record<string, string>>,
): AgentDefsDeps {
  return {
    dirs,
    listMd: (dir) => Object.keys(files[dir] ?? {}),
    readText: (path) => {
      for (const [dir, byFile] of Object.entries(files)) {
        for (const [file, text] of Object.entries(byFile)) {
          if (join(dir, file) === path) return text;
        }
      }
      return null;
    },
  };
}

describe("parseAgentDef", () => {
  it("parses frontmatter name/description/tools/model and body → systemPrompt", () => {
    const md = [
      "---",
      "name: reviewer",
      "description: Reviews diffs for security issues.",
      "tools: read_file, grep_files, shell_cmd",
      "model: claude-sonnet-4-6",
      "---",
      "You are a code reviewer.",
      "Find and report security issues.",
    ].join("\n");
    const def = parseAgentDef(md);
    expect(def.name).toBe("reviewer");
    expect(def.description).toBe("Reviews diffs for security issues.");
    expect(def.allowTools).toEqual(["read_file", "grep_files", "shell_cmd"]);
    expect(def.model).toBe("claude-sonnet-4-6");
    expect(def.systemPrompt).toBe(
      "You are a code reviewer.\nFind and report security issues.",
    );
  });

  it("parses a bracketed tools list", () => {
    const md = ["---", "name: x", "tools: [read_file, grep_files]", "---", "body"].join("\n");
    expect(parseAgentDef(md).allowTools).toEqual(["read_file", "grep_files"]);
  });

  it("falls back to a slug of the fallbackName when name is missing", () => {
    const md = ["---", "description: no name here", "---", "body text"].join("\n");
    // listAgentDefs strips ".md" before passing the basename; slugify drops "."s.
    expect(parseAgentDef(md, "My Custom Agent").name).toBe("my-custom-agent");
  });

  it("falls back to a slug of the body's first line when no name and no fallback", () => {
    const def = parseAgentDef("Just A Body Line\nmore body");
    expect(def.name).toBe("just-a-body-line");
    expect(def.systemPrompt).toBe("Just A Body Line\nmore body");
  });

  it("uses the literal 'agent' slug when there is nothing to slug", () => {
    expect(parseAgentDef("").name).toBe("agent");
  });

  it("treats a file with no frontmatter as all body, name from fallback", () => {
    const def = parseAgentDef("plain body, no fences", "helper");
    expect(def.name).toBe("helper");
    expect(def.description).toBe("");
    expect(def.allowTools).toBeUndefined();
    expect(def.model).toBeUndefined();
    expect(def.systemPrompt).toBe("plain body, no fences");
  });

  it("leaves allowTools undefined (unrestricted) when tools key is missing", () => {
    const md = ["---", "name: open", "description: d", "---", "body"].join("\n");
    expect(parseAgentDef(md).allowTools).toBeUndefined();
  });

  it("leaves allowTools undefined when tools is empty", () => {
    const md = ["---", "name: open", "tools:", "---", "body"].join("\n");
    expect(parseAgentDef(md).allowTools).toBeUndefined();
  });

  it("produces a minimal def (empty systemPrompt) for an empty body", () => {
    const md = ["---", "name: bare", "---", ""].join("\n");
    const def = parseAgentDef(md);
    expect(def.name).toBe("bare");
    expect(def.systemPrompt).toBe("");
  });

  it("splits frontmatter values on the first colon only", () => {
    const md = ["---", "name: t", "description: a: b: c", "---", "body"].join("\n");
    expect(parseAgentDef(md).description).toBe("a: b: c");
  });

  it("ignores unknown frontmatter keys", () => {
    const md = ["---", "name: t", "color: blue", "---", "body"].join("\n");
    const def = parseAgentDef(md);
    expect(def.name).toBe("t");
    expect(def.systemPrompt).toBe("body");
  });
});

describe("listAgentDefs", () => {
  const projectDir = "/repo/.claude/agents";
  const userDir = "/home/.vanta/agents";

  it("reads defs from both dirs via the injected reader", () => {
    const deps = fakeDeps([projectDir, userDir], {
      [projectDir]: {
        "reviewer.md": "---\nname: reviewer\n---\nreview body",
      },
      [userDir]: {
        "planner.md": "---\nname: planner\n---\nplan body",
      },
    });
    const defs = listAgentDefs(deps);
    expect(defs.map((d) => d.name).sort()).toEqual(["planner", "reviewer"]);
  });

  it("lets an earlier dir (project) win on a name clash with a later dir (user)", () => {
    const deps = fakeDeps([projectDir, userDir], {
      [projectDir]: { "a.md": "---\nname: shared\n---\nPROJECT version" },
      [userDir]: { "a.md": "---\nname: shared\n---\nUSER version" },
    });
    const defs = listAgentDefs(deps);
    expect(defs).toHaveLength(1);
    expect(defs[0]!.systemPrompt).toBe("PROJECT version");
  });

  it("skips non-md files and unreadable files", () => {
    const deps: AgentDefsDeps = {
      dirs: [projectDir],
      listMd: () => ["good.md", "notes.txt", "missing.md"],
      readText: (path) =>
        path === join(projectDir, "good.md") ? "---\nname: good\n---\nbody" : null,
    };
    const defs = listAgentDefs(deps);
    expect(defs.map((d) => d.name)).toEqual(["good"]);
  });

  it("returns [] when no dirs have files (no files = built-ins only behavior)", () => {
    const deps = fakeDeps([projectDir, userDir], {});
    expect(listAgentDefs(deps)).toEqual([]);
  });
});

describe("defaultAgentDirs", () => {
  it("returns project .claude/agents then user ~/.vanta/agents", () => {
    expect(defaultAgentDirs("/repo", "/home")).toEqual([
      "/repo/.claude/agents",
      "/home/.vanta/agents",
    ]);
  });
});

describe("resolveAgentType", () => {
  const custom: CustomAgentDef[] = [
    { name: "reviewer", description: "d", systemPrompt: "review prompt" },
    { name: "Explore", description: "override", systemPrompt: "my explore" },
  ];

  it("resolves a custom def by name (case-insensitive)", () => {
    const type = resolveAgentType("REVIEWER", custom);
    expect(isCustomAgentDef(type)).toBe(true);
    expect((type as CustomAgentDef).systemPrompt).toBe("review prompt");
  });

  it("resolves a built-in name to the built-in type when no custom matches", () => {
    const type = resolveAgentType("plan", custom);
    expect(isCustomAgentDef(type)).toBe(false);
    expect(type.name).toBe("plan");
  });

  it("lets a custom def WIN over a built-in of the same name (override)", () => {
    const type = resolveAgentType("explore", custom);
    expect(isCustomAgentDef(type)).toBe(true);
    expect((type as CustomAgentDef).systemPrompt).toBe("my explore");
  });

  it("falls back to the general-purpose built-in for an unknown name", () => {
    const type = resolveAgentType("nonexistent", custom);
    expect(isCustomAgentDef(type)).toBe(false);
    expect(type.name).toBe(DEFAULT_AGENT_TYPE);
  });

  it("falls back to the general-purpose built-in for an empty/null/undefined name", () => {
    for (const n of ["", null, undefined]) {
      const type = resolveAgentType(n, custom);
      expect(isCustomAgentDef(type)).toBe(false);
      expect(type.name).toBe(DEFAULT_AGENT_TYPE);
    }
  });

  it("falls back to built-ins when there are no custom defs", () => {
    expect(resolveAgentType("verification", []).name).toBe("verification");
    expect(resolveAgentType("unknown", []).name).toBe(DEFAULT_AGENT_TYPE);
  });

  it("reuses the built-in resolver for the fallback (injectable)", () => {
    const type = resolveAgentType("plan", custom, resolveBuiltinAgent);
    expect(type).toEqual(resolveBuiltinAgent("plan"));
  });
});
