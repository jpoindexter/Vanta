import assert from "node:assert/strict";
import test from "node:test";
import { resolveRuntimePaths } from "./runtime-paths.mjs";

test("source runtime uses the verified debug kernel", () => {
  const paths = resolveRuntimePaths({ appPath: "/repo/vanta-ts", packaged: false, resourcesPath: "", platform: "darwin" });
  assert.equal(paths.kernel, "/repo/target/debug/vanta-kernel");
});

test("packaged runtime uses its embedded signed kernel", () => {
  const paths = resolveRuntimePaths({ appPath: "/Applications/Vanta.app/Contents/Resources/app.asar", packaged: true, resourcesPath: "/Applications/Vanta.app/Contents/Resources", platform: "darwin" });
  assert.equal(paths.kernel, "/Applications/Vanta.app/Contents/Resources/kernel/vanta-kernel");
});
