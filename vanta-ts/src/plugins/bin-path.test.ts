import { describe, it, expect } from "vitest";
import { delimiter } from "node:path";
import { resolvePluginBinDirs, buildPluginPath, pluginPathEnv } from "./bin-path.js";

// A fake fs probe: only the listed paths "exist". No real filesystem touched.
function existsIn(present: string[]): (p: string) => boolean {
  const set = new Set(present);
  return (p) => set.has(p);
}

describe("resolvePluginBinDirs", () => {
  it("returns each plugin's bin dir when it exists", () => {
    const dirs = ["/home/u/.vanta/plugins/alpha", "/home/u/.vanta/plugins/beta"];
    const deps = { exists: existsIn(["/home/u/.vanta/plugins/alpha/bin", "/home/u/.vanta/plugins/beta/bin"]) };
    expect(resolvePluginBinDirs(dirs, deps)).toEqual([
      "/home/u/.vanta/plugins/alpha/bin",
      "/home/u/.vanta/plugins/beta/bin",
    ]);
  });

  it("drops plugins whose bin dir does not exist", () => {
    const dirs = ["/p/alpha", "/p/beta"];
    const deps = { exists: existsIn(["/p/alpha/bin"]) }; // beta/bin missing
    expect(resolvePluginBinDirs(dirs, deps)).toEqual(["/p/alpha/bin"]);
  });

  it("returns the joined in-plugin bin dir, never a sibling/parent path", () => {
    const dirs = ["/p/alpha"];
    const deps = { exists: existsIn(["/p/alpha/bin"]) };
    const binDir = resolvePluginBinDirs(dirs, deps)[0] ?? "";
    expect(binDir).toBe("/p/alpha/bin");
    expect(binDir.startsWith("/p/alpha/")).toBe(true); // inside the plugin dir
  });

  it("no plugin dirs → empty list (unchanged PATH upstream)", () => {
    expect(resolvePluginBinDirs([], { exists: () => true })).toEqual([]);
  });

  it("never consults a path outside the plugin's own bin dir", () => {
    const probed: string[] = [];
    const deps = { exists: (p: string) => { probed.push(p); return true; } };
    resolvePluginBinDirs(["/p/alpha"], deps);
    // The ONLY path probed for alpha is its own joined bin dir.
    expect(probed).toEqual(["/p/alpha/bin"]);
  });
});

describe("buildPluginPath", () => {
  it("prepends bin dirs to the base PATH using the separator", () => {
    expect(buildPluginPath(["/p/a/bin", "/p/b/bin"], "/usr/bin:/bin", ":")).toBe(
      "/p/a/bin:/p/b/bin:/usr/bin:/bin",
    );
  });

  it("dedupes a bin dir already on the base PATH (first occurrence wins)", () => {
    expect(buildPluginPath(["/p/a/bin"], "/usr/bin:/p/a/bin:/bin", ":")).toBe(
      "/p/a/bin:/usr/bin:/bin",
    );
  });

  it("dedupes repeated bin dirs in the prepend list", () => {
    expect(buildPluginPath(["/p/a/bin", "/p/a/bin"], "/usr/bin", ":")).toBe("/p/a/bin:/usr/bin");
  });

  it("drops empty entries from both bin dirs and base PATH", () => {
    expect(buildPluginPath(["", "/p/a/bin"], "/usr/bin::/bin", ":")).toBe("/p/a/bin:/usr/bin:/bin");
  });

  it("no bin dirs → returns the base PATH unchanged", () => {
    expect(buildPluginPath([], "/usr/bin:/bin", ":")).toBe("/usr/bin:/bin");
  });

  it("no bin dirs + empty base PATH → empty string", () => {
    expect(buildPluginPath([], "", ":")).toBe("");
  });

  it("honors a non-colon separator (windows ;)", () => {
    expect(buildPluginPath(["C:\\p\\a\\bin"], "C:\\Windows", ";")).toBe("C:\\p\\a\\bin;C:\\Windows");
  });
});

describe("pluginPathEnv", () => {
  it("returns a {PATH} overlay with bins ahead of the current PATH", () => {
    const overlay = pluginPathEnv(["/p/a/bin"], { PATH: "/usr/bin:/bin" } as NodeJS.ProcessEnv);
    expect(overlay).toEqual({ PATH: ["/p/a/bin", "/usr/bin", "/bin"].join(delimiter) });
  });

  it("no bin dirs → returns {} so the env is UNCHANGED", () => {
    expect(pluginPathEnv([], { PATH: "/usr/bin:/bin" } as NodeJS.ProcessEnv)).toEqual({});
  });

  it("missing env PATH is treated as empty (bins become the whole PATH)", () => {
    const overlay = pluginPathEnv(["/p/a/bin"], {} as NodeJS.ProcessEnv);
    expect(overlay).toEqual({ PATH: "/p/a/bin" });
  });

  it("merging the overlay over a base env prepends bins, keeping other keys", () => {
    const base = { HOME: "/home/u", PATH: "/usr/bin" } as NodeJS.ProcessEnv;
    const merged: NodeJS.ProcessEnv = { ...base, ...pluginPathEnv(["/p/a/bin"], base) };
    expect(merged.HOME).toBe("/home/u");
    expect(merged.PATH).toBe(`/p/a/bin${delimiter}/usr/bin`);
  });
});
