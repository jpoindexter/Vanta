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
