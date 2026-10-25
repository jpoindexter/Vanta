import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("desktop package excludes the unused optional winnow ML dependency chain", () => {
  const files = new Set(manifest.build?.files ?? []);
  const requiredExclusions = [
    "!node_modules/@huggingface/**/*",
    "!node_modules/@img/**/*",
    "!node_modules/adm-zip/**/*",
    "!node_modules/global-agent/**/*",
    "!node_modules/onnxruntime-common/**/*",
    "!node_modules/onnxruntime-node/**/*",
    "!node_modules/onnxruntime-web/**/*",
    "!node_modules/sharp/**/*",
  ];
  for (const exclusion of requiredExclusions) {
    assert.ok(files.has(exclusion), `missing package exclusion: ${exclusion}`);
  }
});

test("desktop package ships the shared launcher, runtime bundle and tsx fallback sources", () => {
  const files = new Set(manifest.build?.files ?? []);
  assert.ok(files.has("desktop-native/runtime-launch.mjs"), "the shared native launcher must be packaged");
  assert.ok(files.has("dist-runtime/**/*"), "dist-runtime must be packaged so the server skips tsx");
  assert.ok(files.has("src/**/*"), "src stays packaged for the tsx fallback and runtime assets");
  assert.match(manifest.scripts["desktop:pack"], /desktop:runtime/, "desktop:pack must build the runtime bundle");
  assert.match(manifest.scripts["desktop:dist"], /desktop:runtime/, "desktop:dist must build the runtime bundle");
});
