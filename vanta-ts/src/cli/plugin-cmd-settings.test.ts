import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runPlugin } from "./plugin-cmd.js";

let fixture: string, root: string, home: string, plugin: string;
beforeEach(async () => {
  fixture = await mkdtemp(join(tmpdir(), "vanta-plugin-settings-"));
  root = join(fixture, "project"); home = join(fixture, "home"); plugin = join(home, "plugins", "synthetic-plugin");
  await mkdir(join(root, ".vanta"), { recursive: true }); await mkdir(plugin, { recursive: true });
  await writeFile(join(plugin, "retained.txt"), "synthetic marker");
  vi.stubEnv("VANTA_HOME", home); vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(fixture, { recursive: true, force: true }); });

describe("plugin uninstall policy preflight", () => {
  it.each(["user", "project", "local"])("keeps the plugin and settings when %s policy is corrupt", async (scope) => {
    const user = join(home, "settings.json");
    await writeFile(user, '{"plugins":{"enabled":["synthetic-plugin"]}}');
    const path = scope === "user" ? user : join(root, ".vanta", scope === "project" ? "settings.json" : "settings.local.json");
    await writeFile(path, '{"blockedTools":');
    const before = await readFile(user, "utf8");
    await expect(runPlugin(root, ["uninstall", "synthetic-plugin"])).rejects.toThrow(path);
    expect((await stat(plugin)).isDirectory()).toBe(true);
    expect(await readFile(join(plugin, "retained.txt"), "utf8")).toBe("synthetic marker");
    expect(await readFile(user, "utf8")).toBe(before);
    expect(await readFile(path, "utf8")).toBe('{"blockedTools":');
  });

  it("still removes a plugin and disables its entry with valid policy", async () => {
    const user = join(home, "settings.json");
    await writeFile(user, '{"plugins":{"enabled":["synthetic-plugin"]},"futurePreference":true}');
    expect(await runPlugin(root, ["uninstall", "synthetic-plugin"])).toBe(0);
    await expect(stat(plugin)).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(user, "utf8"))).toEqual({ plugins: { enabled: [] }, futurePreference: true });
  });
});
