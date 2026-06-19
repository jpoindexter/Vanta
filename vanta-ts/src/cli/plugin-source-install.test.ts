import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installPluginSources } from "./plugin-source-install.js";

let root: string;
let home: string;
let src: string;
let env: NodeJS.ProcessEnv;
let logs: string[];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vanta-psi-root-"));
  home = await mkdtemp(join(tmpdir(), "vanta-psi-home-"));
  src = await mkdtemp(join(tmpdir(), "vanta-psi-src-"));
  env = { VANTA_HOME: home };
  logs = [];
  await mkdir(join(root, ".vanta"), { recursive: true });
});

afterEach(async () => {
  await Promise.all([
    rm(root, { recursive: true, force: true }),
    rm(home, { recursive: true, force: true }),
    rm(src, { recursive: true, force: true }),
  ]);
});

async function writePluginSrc(name: string): Promise<void> {
  await writeFile(join(src, "plugin.json"), JSON.stringify({ name, version: "0.1.0" }));
  await writeFile(join(src, "index.js"), "export function register() {}");
}

const log = (m: string): number => logs.push(m);

describe("installPluginSources", () => {
  it("returns [] and logs nothing for no sources", async () => {
    expect(await installPluginSources(root, [], { env, log })).toEqual([]);
    expect(logs).toEqual([]);
  });

  it("stages a dir source but reports it DISABLED when not in plugins.enabled", async () => {
    await writePluginSrc("echo");
    const installed = await installPluginSources(root, [{ dir: src }], { env, log });
    expect(installed).toEqual(["echo"]);
    expect(existsSync(join(home, "plugins", "echo", "plugin.json"))).toBe(true);
    expect(logs.some((l) => l.includes("installed echo"))).toBe(true);
    expect(logs.some((l) => l.includes("DISABLED"))).toBe(true);
  });

  it("reports a plugin as enabled when settings.plugins.enabled lists it", async () => {
    await writePluginSrc("echo");
    await mkdir(join(root, ".vanta"), { recursive: true });
    await writeFile(join(root, ".vanta", "settings.json"), JSON.stringify({ plugins: { enabled: ["echo"] } }));
    await installPluginSources(root, [{ dir: src }], { env, log });
    expect(logs.some((l) => l.includes("enabled and will load"))).toBe(true);
    expect(logs.some((l) => l.includes("DISABLED"))).toBe(false);
  });

  it("is best-effort: a bad source logs a failure and does not throw", async () => {
    const installed = await installPluginSources(root, [{ dir: "/no/such/path" }], { env, log });
    expect(installed).toEqual([]);
    expect(logs.some((l) => l.includes("failed to install"))).toBe(true);
  });
});
