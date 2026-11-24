import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { stageGetWindowsInto } from "../../apps/desktop/scripts/stage-native-deps.mjs";

const require = createRequire(new URL("../../apps/desktop/package.json", import.meta.url));

test("Typography uses the patched 6.x selector parser without changing selector output", () => {
  const typographyRequire = createRequire(require.resolve("@tailwindcss/typography"));
  const parser = typographyRequire("postcss-selector-parser");
  assert.equal(typographyRequire("postcss-selector-parser/package.json").version, "6.1.5");
  const selectors = Array.from({ length: 2000 }, (_, i) => `.prose :where(h${i % 6 + 1}):not(.skip-${i})`).join(",");
  assert.equal(parser().processSync(selectors), selectors);
  assert.equal(parser().astSync(selectors).nodes.length, 2000);
});

test("get-windows 10 stages with the upstream empty-result contract and no permission prompt", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-get-windows-10-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.dirname(require.resolve("get-windows"));
  const staged = path.join(root, "staged");
  // Linux staging exercises the JS wrapper without enumerating the owner's windows.
  stageGetWindowsInto(source, staged, { platform: "linux" });
  const windows = await import(pathToFileURL(path.join(staged, "lib/windows.js")).href);
  assert.equal(await windows.activeWindow(), undefined);
  assert.equal(windows.activeWindowSync(), undefined);
  assert.deepEqual(await windows.openWindows(), []);
  assert.deepEqual(windows.openWindowsSync(), []);
  const mac = fs.readFileSync(path.join(staged, "lib/macos.js"), "utf8");
  assert.match(mac, /accessibilityPermission === false/);
  assert.match(mac, /screenRecordingPermission === false/);
  assert.match(mac, /--no-accessibility-permission/);
  assert.match(mac, /--no-screen-recording-permission/);
  const macStaged = path.join(root, "mac");
  stageGetWindowsInto(source, macStaged, { platform: "darwin" });
  assert.deepEqual(fs.readFileSync(path.join(macStaged, "main")), fs.readFileSync(path.join(source, "main")));
  assert.ok(fs.statSync(path.join(macStaged, "main")).mode & 0o111);
  const unknown = path.join(root, "unknown");
  fs.mkdirSync(unknown);
  fs.writeFileSync(path.join(unknown, "package.json"), '{"version":"99.0.0"}');
  assert.throws(() => stageGetWindowsInto(unknown, path.join(root, "rejected")), /Re-verify the rewrite/);
});
