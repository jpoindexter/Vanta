import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { desktopRuntimeEnv } from "../../desktop-native/runtime-env.mjs";
import { desktopRuntimeEnv as legacyDesktopRuntimeEnv } from "./runtime-env.mjs";

test("shared runtime environment preserves the classic import identity", () => {
  assert.equal(desktopRuntimeEnv, legacyDesktopRuntimeEnv);
});

test("packaged macOS runtime can find Homebrew and user-local MCP executables", () => {
  const env = desktopRuntimeEnv(
    { PATH: "/usr/bin:/bin", HOME: "/Users/jane", KEEP_ME: "yes" },
    { platform: "darwin", home: "/Users/jane" },
  );
  const path = env.PATH.split(":");

  assert.equal(path[0], "/Users/jane/.local/bin");
  assert.ok(path.includes("/opt/homebrew/bin"));
  assert.ok(path.includes("/usr/local/bin"));
  assert.ok(path.includes("/usr/bin"));
  assert.equal(new Set(path).size, path.length);
  assert.equal(env.KEEP_ME, "yes");
});

test("non-macOS runtime preserves the caller PATH", () => {
  const env = desktopRuntimeEnv({ PATH: "/custom/bin:/usr/bin" }, { platform: "linux", home: "/home/jane" });
  assert.equal(env.PATH, "/custom/bin:/usr/bin");
});

test("macOS executable precedence is stable and removes duplicates and empty entries", () => {
  const standard = [".local/bin", ".npm-global/bin", ".bun/bin", ".volta/bin"]
    .map((path) => join("/Users/jane", path));
  const parent = { PATH: ["", "/custom/bin", "/opt/homebrew/bin", "/custom/bin", "/usr/bin", ""].join(delimiter) };
  const env = desktopRuntimeEnv(parent, { platform: "darwin", home: "/Users/jane" });
  assert.deepEqual(env.PATH.split(delimiter), [
    ...standard, "/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", "/usr/local/sbin",
    "/custom/bin", "/usr/bin",
  ]);
});

test("macOS environment is a new object without changing caller values", () => {
  const parent = Object.freeze({ PATH: "/usr/bin", KEEP_ME: "yes", UNSET: undefined });
  const env = desktopRuntimeEnv(parent, { platform: "darwin", home: "/Users/jane" });
  assert.notEqual(env, parent);
  assert.deepEqual(parent, { PATH: "/usr/bin", KEEP_ME: "yes", UNSET: undefined });
  assert.equal(env.KEEP_ME, "yes");
  assert.ok(Object.hasOwn(env, "UNSET"));
  assert.equal(env.UNSET, undefined);
});

test("missing and empty macOS PATH both receive only the standard locations", () => {
  const options = { platform: "darwin", home: "/Users/jane" };
  const missing = desktopRuntimeEnv({}, options);
  assert.deepEqual(missing, desktopRuntimeEnv({ PATH: "" }, options));
  assert.equal(missing.PATH.split(delimiter).length, 8);
  assert.ok(!missing.PATH.split(delimiter).includes(""));
});

test("non-macOS environments remain unchanged copies including absent PATH", () => {
  for (const platform of ["linux", "win32"]) {
    for (const parent of [{ PATH: "C:\\Tools;C:\\Windows", KEEP_ME: "yes" }, { KEEP_ME: "yes" }]) {
      Object.freeze(parent);
      const env = desktopRuntimeEnv(parent, { platform, home: "/unused" });
      assert.notEqual(env, parent);
      assert.deepEqual(env, parent);
    }
  }
});

test("legacy packaged layout includes and resolves the shared environment helper", async () => {
  const runtime = new URL("../../", import.meta.url);
  const pkg = JSON.parse(readFileSync(new URL("package.json", runtime), "utf8"));
  const sharedPath = "desktop-native/runtime-env.mjs";
  const legacyPath = "desktop-app/electron/runtime-env.mjs";
  assert.ok(pkg.build.files.includes(sharedPath));
  assert.ok(pkg.build.files.includes("desktop-app/electron/**/*.mjs"));
  const staged = mkdtempSync(join(tmpdir(), "vanta-runtime-env-layout-"));
  try {
    for (const path of [sharedPath, legacyPath]) {
      const target = join(staged, path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(new URL(path, runtime), target);
    }
    const shared = await import(pathToFileURL(join(staged, sharedPath)).href);
    const legacy = await import(pathToFileURL(join(staged, legacyPath)).href);
    assert.equal(legacy.desktopRuntimeEnv, shared.desktopRuntimeEnv);
    const parent = { PATH: "/usr/bin", KEEP_ME: "yes" };
    const options = { platform: "darwin", home: "/Users/jane" };
    assert.deepEqual(legacy.desktopRuntimeEnv(parent, options), desktopRuntimeEnv(parent, options));
  } finally {
    rmSync(staged, { recursive: true, force: true });
  }
});
