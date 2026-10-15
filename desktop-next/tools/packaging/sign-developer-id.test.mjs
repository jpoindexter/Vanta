import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { codesignArgs, nestedBundles, signingOrder } from "./sign-developer-id.mjs";

const MACHO = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0, 0, 0, 0]);
const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
};

function fixtureApp() {
  const app = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sign-test-")), "Vanta.app");
  const fw = path.join(app, "Contents", "Frameworks");
  write(path.join(fw, "Electron Framework.framework", "Versions", "A", "Electron Framework"), MACHO);
  write(path.join(fw, "Vanta Helper.app", "Contents", "MacOS", "Vanta Helper"), MACHO);
  write(path.join(fw, "Vanta Helper.app", "Contents", "Frameworks", "Nested.framework", "Nested"), MACHO);
  write(path.join(app, "Contents", "Resources", "kernel", "vanta-kernel"), MACHO);
  write(path.join(app, "Contents", "Resources", "notes.txt"), "not code");

  return app;
}

test("bundles are signed deepest first", () => {
  const app = fixtureApp();
  const bundles = nestedBundles(path.join(app, "Contents", "Frameworks")).map((full) => path.basename(full));

  assert.equal(bundles.indexOf("Nested.framework") < bundles.indexOf("Vanta Helper.app"), true);
  assert.deepEqual(new Set(bundles), new Set(["Nested.framework", "Vanta Helper.app", "Electron Framework.framework"]));
});

test("the order is loose code, then bundles, then the app; plain files are never signed", () => {
  const app = fixtureApp();
  const plan = signingOrder({ app, looseDirs: [path.join(app, "Contents", "Resources", "kernel")] });

  assert.equal(plan.files.some((file) => file.endsWith("vanta-kernel")), true);
  assert.equal(plan.files.some((file) => file.endsWith("notes.txt")), false);
  assert.equal(plan.app, app);
});

test("every signature uses the hardened runtime and a secure timestamp; entitlements only where asked", () => {
  const plain = codesignArgs({ identity: "HASH", entitlements: "e.plist", target: "/x", withEntitlements: false });
  const full = codesignArgs({ identity: "HASH", entitlements: "e.plist", target: "/x", withEntitlements: true });

  for (const args of [plain, full]) {
    assert.deepEqual(args.slice(0, 4), ["--force", "--timestamp", "--options", "runtime"]);
    assert.equal(args.at(-1), "/x");
    assert.equal(args[args.indexOf("--sign") + 1], "HASH");
  }
  assert.equal(plain.includes("--entitlements"), false);
  assert.equal(full[full.indexOf("--entitlements") + 1], "e.plist");
});
