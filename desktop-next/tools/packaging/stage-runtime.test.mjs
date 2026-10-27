import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { stageRuntime } from "./stage-runtime.mjs";

test("runtime staging retains native bootstrap files, not test-only files", (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-stage-native-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const source = path.join(fixture, "source");
  const dest = path.join(fixture, "staged");
  const files = {
    "package.json": '{"type":"module"}',
    "dist-runtime/cli.mjs": 'import "../desktop-native/runtime-fetch-init.mjs";',
    "src/cli.ts": 'import "../desktop-native/runtime-fetch-init.mjs";',
    "src/cli.test.ts": "test-only",
    "desktop-native/maintained-fetch.mjs": "export const maintainedFetch = fetch;",
    "desktop-native/runtime-fetch-init.mjs": 'import "./maintained-fetch.mjs";',
    "desktop-native/maintained-fetch.d.mts": "export const maintainedFetch: typeof fetch;",
    "desktop-native/runtime-env.mjs": "export const env = {};",
    "desktop-native/fetch.node-test.mjs": "test-only",
    "desktop-native/env.test.mjs": "test-only",
    "desktop-app/dist/index.html": "<main>Vanta</main>"
  };
  for (const [name, bytes] of Object.entries(files)) {
    const target = path.join(source, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  fs.mkdirSync(path.join(source, "node_modules"));
  assert.deepEqual(stageRuntime({ vantaTs: source, dest }), { packages: 0 });
  for (const [name, bytes] of Object.entries(files)) {
    const target = path.join(dest, name);
    if (name.includes(".test.") || name.includes(".node-test.")) {
      assert.equal(fs.existsSync(target), false, name);
    } else {
      assert.equal(fs.readFileSync(target, "utf8"), bytes, name);
    }
  }
});
