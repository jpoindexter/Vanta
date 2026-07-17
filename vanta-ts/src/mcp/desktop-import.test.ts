import { describe, it, expect } from "vitest";
import { join } from "node:path";
import {
  parseDesktopConfig,
  mergeMcpServers,
  desktopConfigPath,
  importDesktopMcp,
  type ImportFs,
} from "./desktop-import.js";

describe("parseDesktopConfig", () => {
  it("extracts the mcpServers map from valid config", () => {
    const text = JSON.stringify({
      mcpServers: { filesystem: { command: "npx", args: ["-y", "@mcp/fs"] } },
      globalShortcut: "Cmd+Shift+C",
    });
    const r = parseDesktopConfig(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mcpServers).toEqual({ filesystem: { command: "npx", args: ["-y", "@mcp/fs"] } });
  });

  it("returns an empty map when mcpServers is absent", () => {
    const r = parseDesktopConfig(JSON.stringify({ theme: "dark" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mcpServers).toEqual({});
  });

  it("reads Vanta's servers key so imports preserve catalog installs", () => {
    const r = parseDesktopConfig(JSON.stringify({ servers: { fetch: { command: "npx" } } }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mcpServers.fetch).toEqual({ command: "npx" });
  });

  it("preserves arbitrary server fields verbatim (env, url, etc.)", () => {
    const entry = { command: "node", args: ["s.mjs"], env: { KEY: "v" }, url: "https://x" };
    const r = parseDesktopConfig(JSON.stringify({ mcpServers: { s: entry } }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mcpServers.s).toEqual(entry);
  });

  it("returns an error result on malformed JSON", () => {
    const r = parseDesktopConfig("{ not json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/invalid JSON/);
  });

  it("returns an error result when mcpServers is the wrong type", () => {
    const r = parseDesktopConfig(JSON.stringify({ mcpServers: "nope" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unexpected config shape/);
  });
});

describe("mergeMcpServers", () => {
  it("imports new keys and never overwrites existing ones", () => {
    const existing = { a: { command: "keep-me" } };
    const incoming = { a: { command: "DO-NOT-CLOBBER" }, b: { command: "new" } };
    const r = mergeMcpServers(existing, incoming);
    expect(r.merged.a).toEqual({ command: "keep-me" });
    expect(r.merged.b).toEqual({ command: "new" });
    expect(r.imported).toEqual(["b"]);
    expect(r.skipped).toEqual(["a"]);
  });

  it("imports everything when there is no overlap", () => {
    const r = mergeMcpServers({}, { x: { command: "x" }, y: { command: "y" } });
    expect(r.imported.sort()).toEqual(["x", "y"]);
    expect(r.skipped).toEqual([]);
  });

  it("skips everything and reports it when all keys collide", () => {
    const r = mergeMcpServers({ x: { command: "orig" } }, { x: { command: "other" } });
    expect(r.imported).toEqual([]);
    expect(r.skipped).toEqual(["x"]);
    expect(r.merged).toEqual({ x: { command: "orig" } });
  });

  it("does not mutate the existing input object", () => {
    const existing = { a: { command: "a" } };
    mergeMcpServers(existing, { b: { command: "b" } });
    expect(existing).toEqual({ a: { command: "a" } });
  });
});

describe("desktopConfigPath", () => {
  it("resolves the macOS Application Support path", () => {
    expect(desktopConfigPath("darwin", "/Users/jane")).toBe(
      "/Users/jane/Library/Application Support/Claude/claude_desktop_config.json",
    );
  });

  it("resolves a Windows AppData path", () => {
    const p = desktopConfigPath("win32", "C:\\Users\\jane");
    expect(p).toMatch(/Claude[\\/]claude_desktop_config\.json$/);
  });

  it("returns null for an unsupported platform", () => {
    expect(desktopConfigPath("linux", "/home/jane")).toBeNull();
  });
});

// In-memory fs so importDesktopMcp is tested without touching real files.
function fakeFs(files: Record<string, string>): { fs: ImportFs; files: Record<string, string> } {
  const store: Record<string, string> = { ...files };
  const fs: ImportFs = {
    readFile: async (p) => {
      const v = store[p];
      if (v === undefined) throw new Error(`ENOENT ${p}`);
      return v;
    },
    writeFile: async (p, d) => { store[p] = d; },
    mkdir: async () => {},
  };
  return { fs, files: store };
}

describe("importDesktopMcp (IO wrapper, injected fs)", () => {
  const home = "/home/op";
  const env = { VANTA_HOME: "/home/op/.vanta" } as NodeJS.ProcessEnv;
  const desktopPath = desktopConfigPath("darwin", home)!;
  const targetPath = join("/home/op/.vanta", "mcp.json");

  it("merges desktop servers into a fresh Vanta config", async () => {
    const desktop = JSON.stringify({ mcpServers: { fs: { command: "npx" }, git: { command: "git-mcp" } } });
    const { fs, files } = fakeFs({ [desktopPath]: desktop });
    const r = await importDesktopMcp({ env, platform: "darwin", home, fs });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.imported.sort()).toEqual(["fs", "git"]);
      expect(r.skipped).toEqual([]);
      expect(r.targetPath).toBe(targetPath);
    }
    const written = JSON.parse(files[targetPath]!);
    expect(written.mcpServers.fs).toEqual({ command: "npx" });
    expect(written.mcpServers.git).toEqual({ command: "git-mcp" });
  });

  it("does not overwrite existing Vanta keys, reports skipped", async () => {
    const desktop = JSON.stringify({ mcpServers: { keep: { command: "DESKTOP" }, add: { command: "new" } } });
    const existing = JSON.stringify({ mcpServers: { keep: { command: "VANTA-ORIGINAL" } } });
    const { fs, files } = fakeFs({ [desktopPath]: desktop, [targetPath]: existing });
    const r = await importDesktopMcp({ env, platform: "darwin", home, fs });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.imported).toEqual(["add"]);
      expect(r.skipped).toEqual(["keep"]);
    }
    const written = JSON.parse(files[targetPath]!);
    expect(written.mcpServers.keep).toEqual({ command: "VANTA-ORIGINAL" });
    expect(written.mcpServers.add).toEqual({ command: "new" });
  });

  it("preserves existing servers-key entries while importing", async () => {
    const desktop = JSON.stringify({ mcpServers: { notes: { command: "notes" } } });
    const existing = JSON.stringify({ servers: { fetch: { command: "fetch" } } });
    const { fs, files } = fakeFs({ [desktopPath]: desktop, [targetPath]: existing });
    const r = await importDesktopMcp({ env, platform: "darwin", home, fs });
    expect(r.ok).toBe(true);
    const written = JSON.parse(files[targetPath]!);
    expect(written.mcpServers.fetch).toEqual({ command: "fetch" });
    expect(written.mcpServers.notes).toEqual({ command: "notes" });
  });

  it("does not write the target file when nothing is imported", async () => {
    const desktop = JSON.stringify({ mcpServers: { keep: { command: "x" } } });
    const existing = JSON.stringify({ mcpServers: { keep: { command: "orig" } } });
    const { fs, files } = fakeFs({ [desktopPath]: desktop, [targetPath]: existing });
    const before = files[targetPath];
    const r = await importDesktopMcp({ env, platform: "darwin", home, fs });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.imported).toEqual([]);
    expect(files[targetPath]).toBe(before); // untouched
  });

  it("returns a clean message when the desktop config is missing", async () => {
    const { fs } = fakeFs({});
    const r = await importDesktopMcp({ env, platform: "darwin", home, fs });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no Claude Desktop config found/);
  });

  it("returns an error when the desktop config is malformed", async () => {
    const { fs } = fakeFs({ [desktopPath]: "{ broken" });
    const r = await importDesktopMcp({ env, platform: "darwin", home, fs });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/invalid JSON/);
  });

  it("returns an error on an unsupported platform", async () => {
    const { fs } = fakeFs({});
    const r = await importDesktopMcp({ env, platform: "linux", home, fs });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not supported on platform/);
  });
});
