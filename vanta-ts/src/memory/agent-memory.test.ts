import { describe, it, expect } from "vitest";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendAgentMemory,
  readAgentMemory,
  parseAgentMemory,
  resolveAgentScope,
  resolveAgentMemoryPath,
  sanitizeAgentType,
  defaultAgentMemoryDeps,
  AGENT_MEMORY_SCOPE_ENV,
  type AgentMemoryDeps,
} from "./agent-memory.js";

/** In-memory agent-memory deps: one mutable JSONL "file" + an injected clock. */
function makeDeps(opts: {
  initial?: string | null;
  now?: string;
  failRead?: boolean;
  failAppend?: boolean;
} = {}): AgentMemoryDeps & { content: () => string | null } {
  let file: string | null = opts.initial ?? null;
  return {
    read: async () => {
      if (opts.failRead) throw new Error("read boom");
      return file;
    },
    append: async (line) => {
      if (opts.failAppend) throw new Error("append boom");
      file = (file ?? "") + line;
    },
    now: () => new Date(opts.now ?? "2026-06-20T12:00:00.000Z"),
    content: () => file,
  };
}

const REPO = "/tmp/some-repo";

describe("resolveAgentScope — VANTA_AGENT_MEMORY_SCOPE, null when unset", () => {
  it("returns 'user' / 'project' / 'local' when set", () => {
    expect(resolveAgentScope({ [AGENT_MEMORY_SCOPE_ENV]: "user" })).toBe("user");
    expect(resolveAgentScope({ [AGENT_MEMORY_SCOPE_ENV]: "project" })).toBe("project");
    expect(resolveAgentScope({ [AGENT_MEMORY_SCOPE_ENV]: "local" })).toBe("local");
  });

  it("returns null when unset (default → existing shared memory)", () => {
    expect(resolveAgentScope({})).toBeNull();
  });

  it("returns null for a whitespace-only value (default preserved)", () => {
    expect(resolveAgentScope({ [AGENT_MEMORY_SCOPE_ENV]: "   " })).toBeNull();
  });

  it("returns null for an unrecognized value (default preserved)", () => {
    expect(resolveAgentScope({ [AGENT_MEMORY_SCOPE_ENV]: "global" })).toBeNull();
  });

  it("is case-insensitive and trims", () => {
    expect(resolveAgentScope({ [AGENT_MEMORY_SCOPE_ENV]: "  USER  " })).toBe("user");
  });
});

describe("sanitizeAgentType — no path traversal into the filename", () => {
  it("strips a leading-dot traversal attempt", () => {
    expect(sanitizeAgentType("../../etc/passwd")).toBe("etcpasswd");
  });

  it("strips path separators", () => {
    expect(sanitizeAgentType("a/b\\c")).toBe("abc");
  });

  it("strips an absolute-path leading slash", () => {
    expect(sanitizeAgentType("/root/agent")).toBe("rootagent");
  });

  it("lowercases and slugifies spaces", () => {
    expect(sanitizeAgentType("Plan Agent")).toBe("plan-agent");
  });

  it("falls back to 'default' for an all-garbage type", () => {
    expect(sanitizeAgentType("../")).toBe("default");
    expect(sanitizeAgentType("")).toBe("default");
  });

  it("never produces a separator or dot that could escape the dir", () => {
    for (const t of ["..", "../x", "/x", "x/..", "a\\b/c", "...."]) {
      const slug = sanitizeAgentType(t);
      expect(slug).not.toMatch(/[/\\]/);
      expect(slug).not.toContain("..");
    }
  });
});

describe("resolveAgentMemoryPath — per-scope path resolution", () => {
  it("user scope → ~/.vanta/agent-memory/<slug>.jsonl", () => {
    const { dir, path } = resolveAgentMemoryPath("explore", "user", REPO, {});
    expect(dir).toBe(join(homedir(), ".vanta", "agent-memory"));
    expect(path).toBe(join(homedir(), ".vanta", "agent-memory", "explore.jsonl"));
  });

  it("user scope honours VANTA_HOME override", () => {
    const { path } = resolveAgentMemoryPath("explore", "user", REPO, {
      VANTA_HOME: "/custom/home",
    });
    expect(path).toBe(join("/custom/home", "agent-memory", "explore.jsonl"));
  });

  it("project scope → <repo>/.vanta/agent-memory/<slug>.jsonl", () => {
    const { dir, path } = resolveAgentMemoryPath("explore", "project", REPO, {});
    expect(dir).toBe(join(REPO, ".vanta", "agent-memory"));
    expect(path).toBe(join(REPO, ".vanta", "agent-memory", "explore.jsonl"));
  });

  it("local scope → <tmp>/vanta-agent-memory/<slug>.jsonl (session-scoped)", () => {
    const { dir, path } = resolveAgentMemoryPath("explore", "local", REPO, {});
    expect(dir).toBe(join(tmpdir(), "vanta-agent-memory"));
    expect(path).toBe(join(tmpdir(), "vanta-agent-memory", "explore.jsonl"));
  });

  it("sanitizes the agentType in the resolved path (no escape)", () => {
    const { path } = resolveAgentMemoryPath("../../etc/passwd", "project", REPO, {});
    expect(path).toBe(join(REPO, ".vanta", "agent-memory", "etcpasswd.jsonl"));
    expect(path.startsWith(join(REPO, ".vanta", "agent-memory"))).toBe(true);
    expect(path).not.toContain("..");
  });

  it("different agent types resolve to different files (isolation by type)", () => {
    const a = resolveAgentMemoryPath("explore", "project", REPO, {}).path;
    const b = resolveAgentMemoryPath("plan", "project", REPO, {}).path;
    expect(a).not.toBe(b);
  });
});

describe("parseAgentMemory — tolerant reader", () => {
  it("returns [] for a missing file (null)", () => {
    expect(parseAgentMemory(null)).toEqual([]);
  });

  it("returns [] for empty content", () => {
    expect(parseAgentMemory("")).toEqual([]);
  });

  it("drops non-JSON lines, keeps valid ones", () => {
    const raw = [
      JSON.stringify({ ts: "t1", note: "found a path" }),
      "{not json",
      JSON.stringify({ ts: "t2", note: "checked it", tags: ["scan"] }),
    ].join("\n");
    expect(parseAgentMemory(raw)).toEqual([
      { ts: "t1", note: "found a path" },
      { ts: "t2", note: "checked it", tags: ["scan"] },
    ]);
  });

  it("drops rows that fail the schema (missing required field)", () => {
    const raw = [
      JSON.stringify({ ts: "t1", note: "ok" }),
      JSON.stringify({ ts: "t2" }), // missing note
      JSON.stringify({ note: "no ts" }), // missing ts
    ].join("\n");
    expect(parseAgentMemory(raw)).toEqual([{ ts: "t1", note: "ok" }]);
  });

  it("ignores blank lines between rows", () => {
    const raw = `${JSON.stringify({ ts: "t", note: "n" })}\n\n\n`;
    expect(parseAgentMemory(raw)).toHaveLength(1);
  });
});

describe("appendAgentMemory → readAgentMemory round-trip", () => {
  it("appends an entry with an injected ts, then reads it back", async () => {
    const deps = makeDeps();
    const ok = await appendAgentMemory({ note: "noted X" }, deps);
    expect(ok).toBe(true);
    expect(await readAgentMemory(deps)).toEqual([
      { ts: "2026-06-20T12:00:00.000Z", note: "noted X" },
    ]);
  });

  it("preserves order across appends within one namespace", async () => {
    const deps = makeDeps();
    await appendAgentMemory({ note: "first" }, deps);
    await appendAgentMemory({ note: "second", tags: ["t"] }, deps);
    const entries = await readAgentMemory(deps);
    expect(entries.map((e) => e.note)).toEqual(["first", "second"]);
    expect(entries[1]?.tags).toEqual(["t"]);
  });

  it("honours an explicit ts when provided", async () => {
    const deps = makeDeps();
    await appendAgentMemory({ note: "n", ts: "2020-01-01T00:00:00.000Z" }, deps);
    expect((await readAgentMemory(deps))[0]?.ts).toBe("2020-01-01T00:00:00.000Z");
  });

  it("omits tags when not provided", async () => {
    const deps = makeDeps();
    await appendAgentMemory({ note: "n" }, deps);
    expect((await readAgentMemory(deps))[0]).not.toHaveProperty("tags");
  });
});

describe("agent-type isolation — one type's notes don't pollute another's", () => {
  it("explore and plan have separate stores (via separate deps)", async () => {
    const explore = makeDeps();
    const plan = makeDeps();
    await appendAgentMemory({ note: "explore finding" }, explore);
    await appendAgentMemory({ note: "plan decision" }, plan);
    expect((await readAgentMemory(explore)).map((e) => e.note)).toEqual([
      "explore finding",
    ]);
    expect((await readAgentMemory(plan)).map((e) => e.note)).toEqual([
      "plan decision",
    ]);
  });
});

describe("appendAgentMemory — best-effort, never throws into the worker", () => {
  it("returns false (does not throw) when the append fails", async () => {
    const deps = makeDeps({ failAppend: true });
    await expect(appendAgentMemory({ note: "n" }, deps)).resolves.toBe(false);
  });
});

describe("readAgentMemory — tolerant, never throws", () => {
  it("returns [] on a missing namespace (no file yet)", async () => {
    expect(await readAgentMemory(makeDeps({ initial: null }))).toEqual([]);
  });

  it("returns [] when the read fails", async () => {
    expect(await readAgentMemory(makeDeps({ failRead: true }))).toEqual([]);
  });
});

describe("defaultAgentMemoryDeps — real-fs deps point at the sanitized scoped path", () => {
  it("reads null for a never-written file (tolerant → [])", async () => {
    const deps = defaultAgentMemoryDeps("explore", "local", REPO, {
      VANTA_HOME: join(tmpdir(), "vanta-agent-memory-test-never"),
    });
    expect(await readAgentMemory(deps)).toEqual([]);
  });
});
