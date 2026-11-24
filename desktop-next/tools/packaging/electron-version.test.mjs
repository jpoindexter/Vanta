import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repo = path.resolve(import.meta.dirname, "../../..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(repo, file), "utf8"));

test("both Desktop launchers pin the same Electron version in manifests and locks", () => {
  const version = read("desktop-next/apps/desktop/package.json").devDependencies.electron;
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(read("vanta-ts/package.json").devDependencies.electron, version);
  for (const tree of ["desktop-next", "vanta-ts"]) {
    const packages = read(`${tree}/package-lock.json`).packages;
    const owner = tree === "desktop-next" ? "apps/desktop" : "";
    assert.equal(packages[owner].devDependencies.electron, version);
    const entries = Object.entries(packages).filter(([name]) => name.endsWith("node_modules/electron"));
    assert.ok(entries.length > 0, `${tree} has an Electron lock entry`);
    for (const [name, pkg] of entries) assert.equal(pkg.version, version, `${tree}/${name}`);
  }
});
