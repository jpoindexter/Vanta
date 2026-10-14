import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { symlinkFacts } from "./bundle-report.mjs";
import { readPlist, removeKey, setKey } from "./plist.mjs";
import { productionClosure } from "./prod-closure.mjs";
import { cpuSeconds } from "./proc-tree.mjs";
import { stageRuntime } from "./stage-runtime.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "pkg-test-"));
const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const pkg = (dir, name, deps = {}, extra = {}) => write(path.join(dir, "package.json"), JSON.stringify({ name, version: "1.0.0", dependencies: deps, ...extra }));

function fixtureRuntime() {
  const root = tmp();
  pkg(root, "app", { a: "1", skipme: "1" });
  pkg(path.join(root, "node_modules", "a"), "a", { b: "1" }, { optionalDependencies: { missing: "1" } });
  pkg(path.join(root, "node_modules", "b"), "b");
  pkg(path.join(root, "node_modules", "skipme"), "skipme");
  pkg(path.join(root, "node_modules", "unused"), "unused");
  write(path.join(root, "dist-runtime", "cli.mjs"), "export {}");
  write(path.join(root, "src", "skills", "lib.md"), "asset");
  write(path.join(root, "src", "skills", "lib.test.ts"), "test");
  write(path.join(root, "desktop-app", "dist", "index.html"), "<html>");
  return root;
}

test("production closure follows dependencies, tolerates missing optional ones and honours skip", () => {
  const root = fixtureRuntime();
  const names = productionClosure(root, { skip: (name) => name === "skipme" }).map(({ name }) => name).sort();
  assert.deepEqual(names, ["a", "b"]);
});

test("staged runtime holds real files only, drops tests and unused packages", () => {
  const root = fixtureRuntime();
  fs.symlinkSync(path.join(root, "node_modules", "b"), path.join(root, "node_modules", "a", "link-to-b"));
  const dest = path.join(tmp(), "vanta-runtime");
  const { packages } = stageRuntime({ vantaTs: root, dest });
  assert.equal(packages, 3);
  assert.ok(fs.existsSync(path.join(dest, "dist-runtime", "cli.mjs")));
  assert.ok(fs.existsSync(path.join(dest, "src", "skills", "lib.md")));
  assert.ok(!fs.existsSync(path.join(dest, "src", "skills", "lib.test.ts")));
  assert.ok(!fs.existsSync(path.join(dest, "node_modules", "unused")));
  assert.ok(fs.lstatSync(path.join(dest, "node_modules", "a", "link-to-b")).isDirectory(), "symlink was copied as a real directory");
  const facts = symlinkFacts(dest);
  assert.equal(facts.total, 0);
});

test("staging refuses to run without a runtime bundle", () => {
  const root = fixtureRuntime();
  fs.rmSync(path.join(root, "dist-runtime"), { recursive: true });
  assert.throws(() => stageRuntime({ vantaTs: root, dest: path.join(tmp(), "x") }), /npm run desktop:runtime/);
});

test("symlinkFacts flags links that leave the bundle", () => {
  const app = tmp();
  const outside = tmp();
  write(path.join(app, "inside.txt"), "x");
  fs.symlinkSync(path.join(app, "inside.txt"), path.join(app, "ok-link"));
  fs.symlinkSync(outside, path.join(app, "bad-link"));
  assert.deepEqual(symlinkFacts(app).escaping, ["bad-link"]);
});

test("plist keys keep their types", { skip: process.platform !== "darwin" }, () => {
  const file = path.join(tmp(), "Info.plist");
  fs.writeFileSync(file, '<?xml version="1.0"?><plist version="1.0"><dict><key>Old</key><string>x</string></dict></plist>');
  setKey(file, "Name", "Vanta Next");
  setKey(file, "Flag", true);
  setKey(file, "Schemes", [{ CFBundleURLSchemes: ["vanta"] }]);
  removeKey(file, "Old");
  removeKey(file, "Absent");
  assert.deepEqual(readPlist(file), { Name: "Vanta Next", Flag: true, Schemes: [{ CFBundleURLSchemes: ["vanta"] }] });
});

test("cpuSeconds reads ps cputime strings", () => {
  assert.equal(cpuSeconds("0:01.50"), 1.5);
  assert.equal(cpuSeconds("1:02:03.00"), 3723);
});
