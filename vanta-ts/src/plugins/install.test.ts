import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readFile, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installPlugin, verifyPluginDir, type InstallDeps } from "./install.js";

let home: string;
let src: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "vanta-pi-home-"));
  src = await mkdtemp(join(tmpdir(), "vanta-pi-src-"));
  env = { VANTA_HOME: home };
});

afterEach(async () => {
  await Promise.all([rm(home, { recursive: true, force: true }), rm(src, { recursive: true, force: true })]);
});

async function writeManifest(dir: string, manifest: Record<string, unknown>): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "plugin.json"), JSON.stringify(manifest));
  await writeFile(join(dir, "index.js"), "export function register() {}");
}

// Deps that "extract" by copying a prepared dir into the target — no real unzip.
function depsFromDir(prepared: string): InstallDeps {
  return {
    fetchZip: vi.fn(async (_url: string, dest: string) => { await writeFile(dest, "PK-fake"); }),
    extractZip: vi.fn(async (_zip: string, dir: string) => { await cp(prepared, dir, { recursive: true }); }),
    vantaHome: (e) => e.VANTA_HOME!,
  };
}

describe("verifyPluginDir", () => {
  it("rejects a directory with no plugin.json", async () => {
    await expect(verifyPluginDir(src)).rejects.toThrow(/no plugin.json/);
  });

  it("rejects malformed JSON", async () => {
    await mkdir(src, { recursive: true });
    await writeFile(join(src, "plugin.json"), "{not json");
    await expect(verifyPluginDir(src)).rejects.toThrow(/not valid JSON/);
  });

  it("rejects a manifest that violates the schema", async () => {
    await writeFile(join(src, "plugin.json"), JSON.stringify({ name: "Bad Name", version: "1" }));
    await expect(verifyPluginDir(src)).rejects.toThrow();
  });

  it("accepts a valid manifest", async () => {
    await writeManifest(src, { name: "good", version: "1.0.0" });
    const m = await verifyPluginDir(src);
    expect(m.name).toBe("good");
  });
});

describe("installPlugin from a directory", () => {
  it("stages the dir into ~/.vanta/plugins/<name> and copies code", async () => {
    await writeManifest(src, { name: "echo", version: "0.1.0", main: "index.js" });
    const result = await installPlugin({ dir: src }, { env, enabled: [] });
    expect(result.name).toBe("echo");
    expect(result.dir).toBe(join(home, "plugins", "echo"));
    expect(existsSync(join(result.dir, "plugin.json"))).toBe(true);
    expect(existsSync(join(result.dir, "index.js"))).toBe(true);
  });

  it("does NOT enable a freshly installed plugin (enable gate)", async () => {
    await writeManifest(src, { name: "echo", version: "0.1.0" });
    const result = await installPlugin({ dir: src }, { env, enabled: [] });
    expect(result.enabled).toBe(false);
  });

  it("reports enabled=true only when the name is already in the allow-list", async () => {
    await writeManifest(src, { name: "echo", version: "0.1.0" });
    const result = await installPlugin({ dir: src }, { env, enabled: ["echo"] });
    expect(result.enabled).toBe(true);
  });

  it("overwrites a prior staged copy on reinstall", async () => {
    await writeManifest(src, { name: "echo", version: "0.1.0" });
    await installPlugin({ dir: src }, { env, enabled: [] });
    await writeFile(join(src, "plugin.json"), JSON.stringify({ name: "echo", version: "0.2.0" }));
    const result = await installPlugin({ dir: src }, { env, enabled: [] });
    const staged = JSON.parse(await readFile(join(result.dir, "plugin.json"), "utf8"));
    expect(staged.version).toBe("0.2.0");
  });
});

describe("installPlugin from a .zip URL", () => {
  it("fetches, extracts, verifies, and stages via injected deps", async () => {
    const prepared = await mkdtemp(join(tmpdir(), "vanta-pi-zip-"));
    await writeManifest(prepared, { name: "fromzip", version: "1.0.0" });
    const deps = depsFromDir(prepared);
    const result = await installPlugin({ url: "https://example.com/p.zip" }, { env, enabled: [], deps });
    expect(deps.fetchZip).toHaveBeenCalledOnce();
    expect(deps.extractZip).toHaveBeenCalledOnce();
    expect(result.name).toBe("fromzip");
    expect(existsSync(join(home, "plugins", "fromzip", "plugin.json"))).toBe(true);
    expect(result.enabled).toBe(false);
    await rm(prepared, { recursive: true, force: true });
  });

  it("unwraps a single nested top-level directory inside the archive", async () => {
    const prepared = await mkdtemp(join(tmpdir(), "vanta-pi-zip-"));
    await writeManifest(join(prepared, "nested-plugin"), { name: "nested", version: "1.0.0" });
    const result = await installPlugin({ url: "https://example.com/p.zip" }, { env, enabled: [], deps: depsFromDir(prepared) });
    expect(result.name).toBe("nested");
    await rm(prepared, { recursive: true, force: true });
  });

  it("propagates a download failure", async () => {
    const deps: InstallDeps = {
      fetchZip: vi.fn(async () => { throw new Error("download failed: 404 Not Found"); }),
      extractZip: vi.fn(),
      vantaHome: (e) => e.VANTA_HOME!,
    };
    await expect(installPlugin({ url: "https://example.com/missing.zip" }, { env, enabled: [], deps })).rejects.toThrow(/download failed/);
    expect(deps.extractZip).not.toHaveBeenCalled();
  });

  it("requires a url or a dir", async () => {
    await expect(installPlugin({}, { env, enabled: [] })).rejects.toThrow(/needs a url or dir/);
  });
});
