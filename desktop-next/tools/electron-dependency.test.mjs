import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { electronBinary, electronPackageRoot } from "./electron-dependency.mjs";

for (const workspace of ["", "apps/desktop"]) {
  test(`Electron resolves from ${workspace || "hoisted workspace root"}`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-electron-resolution-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const pkg = path.join(root, workspace, "node_modules/electron");
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ name: "electron", main: "index.js" }));
    fs.writeFileSync(path.join(pkg, "index.js"), "module.exports = 'platform-binary';");
    assert.equal(electronPackageRoot(root), fs.realpathSync(pkg));
    assert.equal(electronBinary(root), "platform-binary");
  });
}

test("a missing prepared Electron dependency fails instead of using a foreign tree", () => {
  assert.throws(() => electronPackageRoot("/nonexistent-vanta-workspace"), /Missing prepared electron dependency/);
});
