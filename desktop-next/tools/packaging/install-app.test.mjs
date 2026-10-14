import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { installApp, installLauncher, LAUNCHER_MARKER, launcherScript } from "./install-app.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "vanta-install-test-"));

function fakeApp(root) {
  const app = path.join(root, "Built.app");
  fs.mkdirSync(path.join(app, "Contents", "Resources"), { recursive: true });
  fs.writeFileSync(path.join(app, "Contents", "Info.plist"), "<plist/>");
  fs.writeFileSync(path.join(app, "Contents", "Resources", "icon.icns"), "icns");
  return app;
}

test("installApp copies the app and replaces the previous copy of the same app only", () => {
  const root = tmp();
  const dest = path.join(root, "Applications");
  fs.mkdirSync(path.join(dest, "Vanta Next.app"), { recursive: true });
  fs.writeFileSync(path.join(dest, "Vanta Next.app", "stale.txt"), "old");
  fs.mkdirSync(path.join(dest, "Other.app"), { recursive: true });

  const target = installApp({ source: fakeApp(root), destDir: dest, name: "Vanta Next" });

  assert.equal(target, path.join(dest, "Vanta Next.app"));
  assert.ok(fs.existsSync(path.join(target, "Contents", "Resources", "icon.icns")));
  assert.ok(!fs.existsSync(path.join(target, "stale.txt")));
  assert.ok(fs.existsSync(path.join(dest, "Other.app")));
});

test("installApp says how to build when there is no built app", () => {
  assert.throws(() => installApp({ source: path.join(tmp(), "none.app"), destDir: tmp(), name: "X" }), /npm run vanta:package/);
});

test("the launcher opens the app and explains a missing install", () => {
  const script = launcherScript("/Users/x/Applications/Vanta Next.app");
  assert.match(script, /exec open "\$APP" --args "\$@"/);
  assert.match(script, /npm run vanta:install/);
  assert.ok(script.includes(LAUNCHER_MARKER));
});

test("installLauncher writes an executable file and can rewrite its own", () => {
  const bin = path.join(tmp(), "bin");
  const file = installLauncher({ binDir: bin, appPath: "/a/Vanta Next.app" });
  assert.ok(fs.statSync(file).mode & 0o100);
  installLauncher({ binDir: bin, appPath: "/b/Vanta Next.app" });
  assert.match(fs.readFileSync(file, "utf8"), /\/b\/Vanta Next\.app/);
});

test("installLauncher refuses to replace a file it did not write", () => {
  const bin = tmp();
  fs.writeFileSync(path.join(bin, "vanta-next"), "#!/bin/sh\necho mine\n");
  assert.throws(() => installLauncher({ binDir: bin, appPath: "/a.app" }), /not written by vanta:install/);
  assert.match(fs.readFileSync(path.join(bin, "vanta-next"), "utf8"), /echo mine/);
});
