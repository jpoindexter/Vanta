import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const archive = require("@electron/asar");
const { FileMatcher } = require("app-builder-lib/out/fileMatcher.js");

const fixture = t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-build-security-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
};

test("builder 26 and universal keep modern filters while archive 3 retains legacy callable matchers", async t => {
  const root = fixture(t), source = path.join(root, "source");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, ".settings"), "fixture");
  fs.writeFileSync(path.join(source, "run"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  fs.writeFileSync(path.join(source, "native.node"), "synthetic native bytes");
  fs.symlinkSync("run", path.join(source, "alias"));
  const packed = path.join(root, "fixture.asar"), restored = path.join(root, "restored");
  await archive.createPackageWithOptions(source, packed, { unpack: "**/*.node" });
  archive.extractAll(packed, restored);
  for (const name of [".settings", "run", "native.node", "alias"]) {
    assert.deepEqual(fs.readFileSync(path.join(restored, name)), fs.readFileSync(path.join(source, name)));
  }
  assert.ok(fs.statSync(path.join(restored, "run")).mode & 0o111);
  assert.ok(fs.lstatSync(path.join(restored, "alias")).isSymbolicLink());
  assert.deepEqual(fs.readFileSync(packed + ".unpacked/native.node"), fs.readFileSync(path.join(source, "native.node")));
  const filter = new FileMatcher("/fixture", "/output", value => value, ["**/*", "!**/*.secret", "!**/.env"]).createFilter();
  const file = { isDirectory: () => false };
  assert.equal(filter("/fixture/main.js", file), true);
  assert.equal(filter("/fixture/keys.secret", file), false);
  assert.equal(filter("/fixture/.env", file), false);
  const match = createRequire(require.resolve("@electron/universal"))("minimatch").minimatch;
  assert.equal(match("native/tool.node", "**/*.node", { matchBase: true }), true);
  assert.equal(typeof createRequire(require.resolve("@electron/asar"))("minimatch"), "function");
  assert.equal(typeof createRequire(require.resolve("filelist"))("minimatch"), "function");
});

test("patched rimraf removes only its exact fixture and does not follow directory links", async t => {
  const root = fixture(t), target = path.join(root, "delete-me"), kept = path.join(root, "keep");
  fs.mkdirSync(target);
  fs.mkdirSync(kept);
  fs.writeFileSync(path.join(kept, "preserved"), "keep");
  fs.writeFileSync(path.join(target, "ordinary"), "remove");
  fs.symlinkSync(kept, path.join(target, "link"));
  assert.equal(await require("rimraf").rimraf(target), true);
  assert.equal(fs.existsSync(target), false);
  assert.equal(fs.readFileSync(path.join(kept, "preserved"), "utf8"), "keep");
});
