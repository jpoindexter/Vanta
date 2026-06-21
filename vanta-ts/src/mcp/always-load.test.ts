import { describe, it, expect } from "vitest";
import { parseAlwaysLoadServers, isAlwaysLoadTool, alwaysLoadToolNames } from "./always-load.js";

describe("parseAlwaysLoadServers", () => {
  it("reads alwaysLoad:true servers from the `servers` key", () => {
    const cfg = { servers: { trusted: { command: "x", alwaysLoad: true }, other: { command: "y" } } };
    expect(parseAlwaysLoadServers(cfg)).toEqual(["trusted"]);
  });

  it("reads alwaysLoad:true servers from the `mcpServers` key", () => {
    const cfg = { mcpServers: { fast: { url: "https://x", alwaysLoad: true } } };
    expect(parseAlwaysLoadServers(cfg)).toEqual(["fast"]);
  });

  it("merges always-load servers across both keys (deduped)", () => {
    const cfg = {
      mcpServers: { a: { command: "a", alwaysLoad: true } },
      servers: { a: { command: "a", alwaysLoad: true }, b: { command: "b", alwaysLoad: true } },
    };
    expect(parseAlwaysLoadServers(cfg).sort()).toEqual(["a", "b"]);
  });

  it("returns [] when no server sets alwaysLoad", () => {
    expect(parseAlwaysLoadServers({ servers: { a: { command: "a" }, b: { url: "https://b" } } })).toEqual([]);
  });

  it("treats alwaysLoad:false and absent the same (not always-load)", () => {
    const cfg = { servers: { a: { command: "a", alwaysLoad: false }, b: { command: "b" } } };
    expect(parseAlwaysLoadServers(cfg)).toEqual([]);
  });

  it("ignores non-boolean-true alwaysLoad values (tolerant)", () => {
    // Only the literal `true` qualifies — truthy strings/1 do not.
    const cfg = { servers: { a: { alwaysLoad: "true" }, b: { alwaysLoad: 1 }, c: { alwaysLoad: true } } };
    expect(parseAlwaysLoadServers(cfg)).toEqual(["c"]);
  });

  it("returns [] for garbage / missing input without throwing", () => {
    expect(parseAlwaysLoadServers(null)).toEqual([]);
    expect(parseAlwaysLoadServers(undefined)).toEqual([]);
    expect(parseAlwaysLoadServers("nope")).toEqual([]);
    expect(parseAlwaysLoadServers(42)).toEqual([]);
    expect(parseAlwaysLoadServers({})).toEqual([]);
    expect(parseAlwaysLoadServers({ servers: "bad", mcpServers: 7 })).toEqual([]);
  });
});

describe("isAlwaysLoadTool", () => {
  it("is true for an mcp_<alwaysLoadServer>_tool", () => {
    expect(isAlwaysLoadTool("mcp_trusted_search", ["trusted"])).toBe(true);
  });

  it("is false for a deferred server's tool", () => {
    expect(isAlwaysLoadTool("mcp_other_search", ["trusted"])).toBe(false);
  });

  it("is false for a non-mcp (built-in) tool", () => {
    expect(isAlwaysLoadTool("read_file", ["trusted"])).toBe(false);
    expect(isAlwaysLoadTool("write_file", ["read_file"])).toBe(false);
  });

  it("does not match a prefix-overlapping server name", () => {
    // server "foo" must NOT match a tool for server "foobar"
    expect(isAlwaysLoadTool("mcp_foobar_x", ["foo"])).toBe(false);
    expect(isAlwaysLoadTool("mcp_foo_x", ["foo"])).toBe(true);
  });

  it("matches a tool whose own name contains underscores", () => {
    expect(isAlwaysLoadTool("mcp_trusted_get_thread", ["trusted"])).toBe(true);
  });

  it("matches a server name with characters mount.ts slugifies", () => {
    // mount.ts slugifies `[^a-zA-Z0-9_-]` → `_`, so `terminal.love` mounts as `terminal_love`.
    expect(isAlwaysLoadTool("mcp_terminal_love_screenshot", ["terminal.love"])).toBe(true);
  });

  it("is false when the always-load set is empty", () => {
    expect(isAlwaysLoadTool("mcp_trusted_search", [])).toBe(false);
  });
});

describe("alwaysLoadToolNames", () => {
  const all = ["read_file", "mcp_trusted_search", "mcp_trusted_get_thread", "mcp_other_x", "tool_search"];

  it("returns only the always-load subset of present names", () => {
    expect(alwaysLoadToolNames(all, ["trusted"])).toEqual(["mcp_trusted_search", "mcp_trusted_get_thread"]);
  });

  it("returns [] when there are no always-load servers", () => {
    expect(alwaysLoadToolNames(all, [])).toEqual([]);
  });

  it("returns [] when no present tool belongs to an always-load server", () => {
    expect(alwaysLoadToolNames(all, ["absent"])).toEqual([]);
  });

  it("spans multiple always-load servers", () => {
    expect(alwaysLoadToolNames(all, ["trusted", "other"])).toEqual([
      "mcp_trusted_search",
      "mcp_trusted_get_thread",
      "mcp_other_x",
    ]);
  });

  it("end-to-end: parse a config then resolve the always-load tool names", () => {
    const cfg = { mcpServers: { trusted: { command: "x", alwaysLoad: true }, other: { command: "y" } } };
    const servers = parseAlwaysLoadServers(cfg);
    expect(alwaysLoadToolNames(all, servers)).toEqual(["mcp_trusted_search", "mcp_trusted_get_thread"]);
  });
});
