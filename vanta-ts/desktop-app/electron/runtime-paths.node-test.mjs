import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { resolveRuntimePaths } from "./runtime-paths.mjs";

test("source runtime uses the verified debug kernel", () => {
  const paths = resolveRuntimePaths({ appPath: "/repo/vanta-ts", packaged: false, resourcesPath: "", platform: "darwin" });
  assert.equal(paths.kernel, "/repo/target/debug/vanta-kernel");
});

test("packaged runtime uses its embedded signed kernel", () => {
  const paths = resolveRuntimePaths({ appPath: "/Applications/Vanta.app/Contents/Resources/app.asar", packaged: true, resourcesPath: "/Applications/Vanta.app/Contents/Resources", platform: "darwin" });
  assert.equal(paths.kernel, "/Applications/Vanta.app/Contents/Resources/kernel/vanta-kernel");
});

test("classic and Next hosts share one neutral native resolver", async () => {
  const neutral = new URL("../../desktop-native/runtime-paths.mjs", import.meta.url);
  assert.ok(existsSync(neutral), "neutral native runtime-path resolver must exist");
  const shared = await import(neutral.href);
  assert.equal(resolveRuntimePaths, shared.resolveRuntimePaths);
});

test("the classic package includes the shared native resolver", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.ok(manifest.build.files.includes("desktop-native/runtime-paths.mjs"), "classic package must include the neutral resolver");
});

for (const platform of ["darwin", "linux", "win32"]) {
  for (const packaged of [false, true]) {
    test(`complete ${platform} paths preserve ${packaged ? "packaged" : "source"} layout with spaces`, () => {
      const appPath = "/Owned Vanta/runtime";
      const resourcesPath = "/Owned Vanta/Contents/Resources";
      const executable = platform === "win32" ? "vanta-kernel.exe" : "vanta-kernel";
      assert.deepEqual(resolveRuntimePaths({ appPath, packaged, resourcesPath, platform }), {
        cli: "/Owned Vanta/runtime/src/cli.ts",
        bundle: "/Owned Vanta/runtime/dist-runtime/cli.mjs",
        loader: packaged ? "/Owned Vanta/Contents/Resources/app.asar.unpacked/node_modules/tsx/dist/loader.mjs"
          : "/Owned Vanta/runtime/node_modules/tsx/dist/loader.mjs",
        dist: "/Owned Vanta/runtime/desktop-app/dist",
        icon: "/Owned Vanta/runtime/desktop-app/build/icon.png",
        kernel: packaged ? `${resourcesPath}/kernel/${executable}` : `/Owned Vanta/target/debug/${executable}`,
      });
    });
  }
}
