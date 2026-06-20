import { describe, expect, it } from "vitest";
import { extractFrontmatterHooks, mergeFrontmatterHooks } from "./frontmatter-hooks.js";
import type { ShellHook } from "./shell-hooks.js";

describe("extractFrontmatterHooks", () => {
  it("returns [] when the frontmatter has no hooks key", () => {
    expect(extractFrontmatterHooks({ name: "x", description: "y" })).toEqual([]);
  });

  it("returns [] for a null/undefined/non-object meta", () => {
    expect(extractFrontmatterHooks(null)).toEqual([]);
    expect(extractFrontmatterHooks(undefined)).toEqual([]);
    expect(extractFrontmatterHooks("not an object" as unknown as null)).toEqual([]);
  });

  it("returns [] when hooks is a scalar (not an array or map)", () => {
    expect(extractFrontmatterHooks({ hooks: "nope" })).toEqual([]);
    expect(extractFrontmatterHooks({ hooks: 42 })).toEqual([]);
    expect(extractFrontmatterHooks({ hooks: null })).toEqual([]);
  });

  it("extracts a valid flat hooks array", () => {
    const meta = {
      hooks: [
        { command: "echo a" },
        { matcher: "write_file", command: "exit 1" },
      ],
    };
    const hooks = extractFrontmatterHooks(meta);
    expect(hooks).toHaveLength(2);
    expect(hooks[0]?.command).toBe("echo a");
    expect(hooks[1]?.matcher).toBe("write_file");
  });

  it("drops invalid entries and keeps valid ones", () => {
    const meta = {
      hooks: [
        { command: "echo ok" }, // valid shell hook
        { matcher: "x" }, // invalid: no command and no mcp_tool/url/prompt
        { type: "mcp_tool", server: "notify", tool: "send" }, // valid mcp hook
        { type: "http" }, // invalid: missing url
        42, // not an object at all
      ],
    };
    const hooks = extractFrontmatterHooks(meta);
    expect(hooks).toHaveLength(2);
    expect(hooks[0]?.command).toBe("echo ok");
    expect(hooks[1]?.type).toBe("mcp_tool");
  });

  it("flattens an event-keyed hooks map into a flat list", () => {
    const meta = {
      hooks: {
        PreToolUse: [{ matcher: "write_file", command: "exit 1" }],
        Stop: [{ command: "echo done" }],
      },
    };
    const hooks = extractFrontmatterHooks(meta);
    expect(hooks).toHaveLength(2);
    expect(hooks.map((h) => h.command)).toEqual(["exit 1", "echo done"]);
  });

  it("never throws on a malformed entry shape", () => {
    expect(() =>
      extractFrontmatterHooks({ hooks: [undefined, [], { command: null }] }),
    ).not.toThrow();
    expect(extractFrontmatterHooks({ hooks: [undefined, [], { command: null }] })).toEqual([]);
  });
});

describe("mergeFrontmatterHooks", () => {
  const a: ShellHook = { command: "echo a" };
  const b: ShellHook = { matcher: "write_file", command: "exit 1" };

  it("combines base and declared hooks, base first", () => {
    const merged = mergeFrontmatterHooks([a], [b]);
    expect(merged).toEqual([a, b]);
  });

  it("dedupes structurally identical hooks across the sets", () => {
    const dup: ShellHook = { command: "echo a" };
    const merged = mergeFrontmatterHooks([a], [dup, b]);
    expect(merged).toHaveLength(2);
    expect(merged).toEqual([a, b]);
  });

  it("dedupes regardless of key order in the entry", () => {
    const reordered = { command: "exit 1", matcher: "write_file" } as ShellHook;
    const merged = mergeFrontmatterHooks([b], [reordered]);
    expect(merged).toHaveLength(1);
  });

  it("returns base unchanged when nothing is declared", () => {
    expect(mergeFrontmatterHooks([a, b], [])).toEqual([a, b]);
  });

  it("returns declared hooks when base is empty", () => {
    expect(mergeFrontmatterHooks([], [a, b])).toEqual([a, b]);
  });

  it("composes with extract: declared frontmatter hooks merge into a base set", () => {
    const base: ShellHook[] = [{ command: "base hook" }];
    const declared = extractFrontmatterHooks({ hooks: [{ command: "skill hook" }] });
    const merged = mergeFrontmatterHooks(base, declared);
    expect(merged.map((h) => h.command)).toEqual(["base hook", "skill hook"]);
  });
});
