import assert from "node:assert/strict";
import test from "node:test";
import { resolveRuntimePaths } from "./runtime-paths.mjs";
import { serverLaunchArgs } from "./runtime-launch.mjs";

const paths = resolveRuntimePaths({ appPath: "/app/vanta-ts", packaged: false, resourcesPath: "", platform: "darwin" });

test("runtime paths expose the precompiled bundle next to src", () => {
  assert.equal(paths.bundle, "/app/vanta-ts/dist-runtime/cli.mjs");
});

test("starts the precompiled bundle in plain node when it exists", () => {
  const launch = serverLaunchArgs({ paths, port: 7790, env: {}, exists: (file) => file === paths.bundle });
  assert.equal(launch.runtime, "bundle");
  assert.deepEqual(launch.args, ["/app/vanta-ts/dist-runtime/cli.mjs", "desktop", "7790", "--no-open"]);
});

test("falls back to tsx with a reason when the bundle is missing", () => {
  const launch = serverLaunchArgs({ paths, port: 7790, env: {}, exists: () => false });
  assert.equal(launch.runtime, "tsx");
  assert.match(launch.reason, /runtime bundle missing at \/app\/vanta-ts\/dist-runtime\/cli\.mjs/);
  assert.deepEqual(launch.args.slice(0, 3), ["--import", "file:///app/vanta-ts/node_modules/tsx/dist/loader.mjs", "/app/vanta-ts/src/cli.ts"]);
});

test("VANTA_DESKTOP_RUNTIME=tsx forces the TypeScript sources even with a bundle", () => {
  const launch = serverLaunchArgs({ paths, port: 7790, env: { VANTA_DESKTOP_RUNTIME: "tsx" }, exists: () => true });
  assert.equal(launch.runtime, "tsx");
  assert.equal(launch.reason, "VANTA_DESKTOP_RUNTIME=tsx");
});

test("appends --companion only when requested", () => {
  const on = serverLaunchArgs({ paths, port: 7791, companion: true, env: {}, exists: () => true });
  const off = serverLaunchArgs({ paths, port: 7791, env: {}, exists: () => true });
  assert.equal(on.args.at(-1), "--companion");
  assert.ok(!off.args.includes("--companion"));
});
