import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  listPlugins, setEnabled, installPlugin, uninstallPlugin,
  isRemoteSource, pluginsRoot, type PluginFs,
} from "./manage.js";
import type { Settings } from "../settings/store.js";

const HOME = "/home";
const ROOT = pluginsRoot(HOME);

/** An in-memory PluginFs over a {path: contents} map for dirs + plugin.json files. */
function fakeFs(opts: {
  dirs?: string[];
  files?: Record<string, string>;
} = {}): { fs: PluginFs; dirs: Set<string>; files: Map<string, string>; copies: Array<[string, string]>; removed: string[] } {
  const dirs = new Set(opts.dirs ?? []);
  const files = new Map(Object.entries(opts.files ?? {}));
  const copies: Array<[string, string]> = [];
  const removed: string[] = [];
  const fs: PluginFs = {
    readdir: async (dir) => {
      if (!dirs.has(dir)) throw new Error(`ENOENT: ${dir}`);
      const prefix = dir.endsWith("/") ? dir : dir + "/";
      const names = new Set<string>();
      const head = (p: string): string => p.slice(prefix.length).split("/")[0] ?? "";
      for (const d of dirs) if (d.startsWith(prefix)) names.add(head(d));
      for (const f of files.keys()) if (f.startsWith(prefix)) names.add(head(f));
      return [...names].filter(Boolean);
    },
    readFile: async (path) => {
      const c = files.get(path);
      if (c === undefined) throw new Error(`ENOENT: ${path}`);
      return c;
    },
    isDirectory: async (path) => dirs.has(path),
    mkdir: async (dir) => { dirs.add(dir); },
    copyDir: async (from, to) => { copies.push([from, to]); dirs.add(to); },
    rmDir: async (dir) => { removed.push(dir); dirs.delete(dir); },
  };
  return { fs, dirs, files, copies, removed };
}

const manifest = (name: string, extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ name, version: "0.1.0", ...extra });

describe("setEnabled (pure)", () => {
  it("adds a name to plugins.enabled", () => {
    const next = setEnabled({}, "echo", true);
    expect(next.plugins?.enabled).toEqual(["echo"]);
  });

  it("removes a name when off", () => {
    const next = setEnabled({ plugins: { enabled: ["echo", "other"] } }, "echo", false);
    expect(next.plugins?.enabled).toEqual(["other"]);
  });

  it("is idempotent on enable and never duplicates", () => {
    const next = setEnabled({ plugins: { enabled: ["echo"] } }, "echo", true);
    expect(next.plugins?.enabled).toEqual(["echo"]);
  });

  it("disabling an absent name is a no-op", () => {
    const next = setEnabled({ plugins: { enabled: ["other"] } }, "echo", false);
    expect(next.plugins?.enabled).toEqual(["other"]);
  });

  it("does not mutate the input settings", () => {
    const input: Settings = { plugins: { enabled: ["echo"] } };
    setEnabled(input, "new", true);
    expect(input.plugins?.enabled).toEqual(["echo"]);
  });

  it("preserves other settings keys", () => {
    const next = setEnabled({ effortLevel: "high", plugins: { trustProjectPlugins: true } }, "echo", true);
    expect(next.effortLevel).toBe("high");
    expect(next.plugins?.trustProjectPlugins).toBe(true);
    expect(next.plugins?.enabled).toEqual(["echo"]);
  });
});

describe("listPlugins", () => {
  it("returns [] when the plugins root is absent", async () => {
    const { fs } = fakeFs();
    expect(await listPlugins(fs, HOME, {})).toEqual([]);
  });

  it("lists installed plugins with enabled state and metadata", async () => {
    const { fs } = fakeFs({
      dirs: [ROOT, join(ROOT, "echo"), join(ROOT, "beta")],
      files: {
        [join(ROOT, "echo", "plugin.json")]: manifest("echo", { description: "echoes" }),
        [join(ROOT, "beta", "plugin.json")]: manifest("beta"),
      },
    });
    const out = await listPlugins(fs, HOME, { plugins: { enabled: ["echo"] } });
    expect(out).toEqual([
      { name: "beta", version: "0.1.0", description: undefined, enabled: false },
      { name: "echo", version: "0.1.0", description: "echoes", enabled: true },
    ]);
  });

  it("skips directories without a valid manifest", async () => {
    const { fs } = fakeFs({
      dirs: [ROOT, join(ROOT, "good"), join(ROOT, "broken")],
      files: {
        [join(ROOT, "good", "plugin.json")]: manifest("good"),
        [join(ROOT, "broken", "plugin.json")]: "{ not json",
      },
    });
    const out = await listPlugins(fs, HOME, {});
    expect(out.map((e) => e.name)).toEqual(["good"]);
  });
});

describe("isRemoteSource", () => {
  it("flags http and https URLs", () => {
    expect(isRemoteSource("https://example.com/p.zip")).toBe(true);
    expect(isRemoteSource("http://example.com/p.zip")).toBe(true);
  });
  it("treats local paths as not remote", () => {
    expect(isRemoteSource("/tmp/my-plugin")).toBe(false);
    expect(isRemoteSource("./plugin")).toBe(false);
  });
});

describe("installPlugin", () => {
  it("copies a validated local plugin dir into the plugins root", async () => {
    const src = "/src/echo";
    const ctx = fakeFs({
      dirs: [src],
      files: { [join(src, "plugin.json")]: manifest("echo", { description: "e" }) },
    });
    const res = await installPlugin(src, ctx.fs, HOME);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.name).toBe("echo");
    expect(ctx.copies).toEqual([[src, join(ROOT, "echo")]]);
  });

  it("defers remote URLs with a clear local-only message", async () => {
    const { fs } = fakeFs();
    const res = await installPlugin("https://example.com/p.zip", fs, HOME);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("local path only");
  });

  it("errors when the source is not a directory", async () => {
    const { fs } = fakeFs();
    const res = await installPlugin("/nope", fs, HOME);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("not a directory");
  });

  it("rejects a malformed manifest without copying", async () => {
    const src = "/src/bad";
    const ctx = fakeFs({
      dirs: [src],
      files: { [join(src, "plugin.json")]: JSON.stringify({ name: "../escape", version: "1.0.0" }) },
    });
    const res = await installPlugin(src, ctx.fs, HOME);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("invalid plugin manifest");
    expect(ctx.copies).toEqual([]);
  });

  it("errors when plugin.json is missing", async () => {
    const src = "/src/empty";
    const ctx = fakeFs({ dirs: [src] });
    const res = await installPlugin(src, ctx.fs, HOME);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("no plugin.json");
  });
});

describe("uninstallPlugin", () => {
  it("removes an installed plugin directory", async () => {
    const dir = join(ROOT, "echo");
    const ctx = fakeFs({ dirs: [ROOT, dir] });
    const res = await uninstallPlugin("echo", ctx.fs, HOME);
    expect(res.ok).toBe(true);
    expect(ctx.removed).toContain(dir);
  });

  it("errors when the plugin is not installed", async () => {
    const ctx = fakeFs({ dirs: [ROOT] });
    const res = await uninstallPlugin("ghost", ctx.fs, HOME);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("not installed");
  });

  it("refuses a path-bearing or traversing name", async () => {
    const ctx = fakeFs({ dirs: [ROOT] });
    for (const bad of ["../x", "a/b", ""]) {
      const res = await uninstallPlugin(bad, ctx.fs, HOME);
      expect(res.ok).toBe(false);
    }
    expect(ctx.removed).toEqual([]);
  });
});
