import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { captureSource } from "./package-provenance.mjs";
import { assertExpectedBuild } from "./build-identity.mjs";

const tools = fileURLToPath(new URL("..", import.meta.url));
const fullCommit = "a".repeat(40);
const write = (file, body) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
};
const content = (app) => fs.readFileSync(path.join(app, "Contents", "Resources", "app.asar"), "utf8");

function nativeMocks(root) {
  const bin = path.join(root, ".fixture-bin");
  const script = `#!${process.execPath}
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_LOG, JSON.stringify([command, ...args]) + '\\n');
if (command === 'git') {
  if (args[0] === 'rev-parse') console.log(args[1] === '--show-toplevel' ? process.cwd() : '${fullCommit}');
  else console.log(' M desktop-next/apps/desktop/src/sample.ts');
} else if (command === 'plutil') {
  console.log(JSON.parse(fs.readFileSync(args.at(-1), 'utf8'))[args[1]]);
} else if (command === 'ditto') {
  const result = spawnSync('/usr/bin/ditto', args, { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
`;
  for (const name of ["git", "ps", "plutil", "codesign", "ditto", "open"]) {
    write(path.join(bin, name), script);
    fs.chmodSync(path.join(bin, name), 0o755);
  }
  return { ...process.env, PATH: `${bin}:${process.env.PATH}`, FIXTURE_LOG: path.join(root, "native.jsonl"),
    VANTA_INSTALL_APPS_DIR: path.join(root, "Applications"), VANTA_INSTALL_BIN_DIR: path.join(root, "bin") };
}

function sourceFixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vanta-install-digest-proof-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of ["install-vanta.mjs", "packaging/install-app.mjs", "packaging/build-identity.mjs", "packaging/package-provenance.mjs"]) {
    write(path.join(root, "desktop-next", "tools", name), fs.readFileSync(path.join(tools, name)));
  }
  const library = path.resolve(tools, "../../vanta-ts/scripts/lib/desktop-local-install.mjs");
  write(path.join(root, "vanta-ts/scripts/lib/desktop-local-install.mjs"), fs.readFileSync(library));
  write(path.join(root, "desktop-next/apps/desktop/product-identity.cjs"), 'module.exports = { displayName: "Vanta" };');
  const sample = path.join(root, "desktop-next/apps/desktop/src/sample.ts");
  write(sample, "export const value = 1;\n");
  const run = (_command, args) => args[0] === "rev-parse" ? (args[1] === "--show-toplevel" ? root : fullCommit) : " M source";
  const expectedSource = captureSource(root, { run });
  return { root, sample, expectedSource, env: nativeMocks(root), cli: path.join(root, "desktop-next/tools/install-vanta.mjs") };
}

function applicationFixture(t) {
  const fixture = sourceFixture(t);
  const source = path.join(fixture.root, "desktop-next/apps/desktop/release/mac-arm64/Vanta.app");
  const target = path.join(fixture.root, "Applications/Vanta.app");
  const build = { version: "0.1.0-fixture", commit: "aaaaaaaa", builtAt: "fixture-clock",
    provenance: { ...fixture.expectedSource, assembly: { sha256: "b".repeat(64), files: 1 } } };
  for (const [app, body] of [[source, "new fixture"], [target, "old fixture"]]) {
    write(path.join(app, "Contents/Resources/app.asar"), body);
    write(path.join(app, "Contents/Info.plist"), JSON.stringify({ CFBundleIdentifier: "studio.theft.vanta-next",
      VantaBuildCommit: build.commit, CFBundleVersion: build.version, CFBundleShortVersionString: build.version }));
  }
  const report = path.join(path.dirname(source), "bundle-report.json");
  write(report, JSON.stringify({ app: source, build }));
  const embedded = path.join(source, "Contents/Resources/vanta-build-provenance.json");
  write(embedded, JSON.stringify(build));
  return { ...fixture, source, target, build, report, embedded };
}

function invoke(fixture) {
  return spawnSync(process.execPath, [fixture.cli, "--no-package"], { env: fixture.env, encoding: "utf8" });
}

function assertRefusedWithoutNative(fixture, result, message) {
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, message);
  assert.equal(content(fixture.target), "old fixture");
  assert.deepEqual(fs.readdirSync(path.dirname(fixture.target)), ["Vanta.app"]);
  assert.equal(fs.existsSync(path.join(fixture.env.VANTA_INSTALL_BIN_DIR, "vanta-next")), false);
  const calls = fs.readFileSync(fixture.env.FIXTURE_LOG, "utf8").trim().split("\n").map(JSON.parse);
  assert.ok(calls.length > 0);
  assert.deepEqual(calls.filter(([command]) => command !== "git"), []);
}

test("actual --no-package CLI refuses same-HEAD source edits before native access or replacement", (t) => {
  const fixture = applicationFixture(t);
  fs.appendFileSync(fixture.sample, "export const changedAfterPackaging = true;\n");
  assertRefusedWithoutNative(fixture, invoke(fixture), /source fingerprint does not match current source/);
});

for (const missing of ["report", "embedded", "mismatched-embedded"]) {
  test(`actual --no-package CLI refuses ${missing} provenance before native access`, (t) => {
    const fixture = applicationFixture(t);
    if (missing === "report") {
      delete fixture.build.provenance;
      write(fixture.report, JSON.stringify({ app: fixture.source, build: fixture.build }));
    } else if (missing === "embedded") fs.unlinkSync(fixture.embedded);
    else write(fixture.embedded, JSON.stringify({ ...fixture.build, builtAt: "different build" }));
    assertRefusedWithoutNative(fixture, invoke(fixture), /source fingerprint|embedded source provenance|Embedded source provenance/);
  });
}

test("actual --no-package CLI accepts matching source/report/embedded build in a disposable mock install", (t) => {
  const fixture = applicationFixture(t);
  const result = invoke(fixture);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(content(fixture.target), "new fixture");
  const rollback = path.join(fixture.root, "Applications/.vanta-install-backups");
  const previous = path.join(rollback, fs.readdirSync(rollback)[0], "Vanta.app");
  assert.equal(content(previous), "old fixture");
  assert.equal(fs.existsSync(path.join(fixture.env.VANTA_INSTALL_BIN_DIR, "vanta-next")), true);
});

test("explicit invalid expected source refuses, while historical standalone identity calls remain compatible", (t) => {
  const fixture = applicationFixture(t);
  const run = (command, args) => {
    assert.equal(command, "plutil");
    return JSON.parse(fs.readFileSync(args.at(-1), "utf8"))[args[1]];
  };
  assert.throws(() => assertExpectedBuild({ candidate: fixture.source, expectedCommit: fixture.build.commit, expectedSource: null, run }), /Verified current source provenance/);
  assertExpectedBuild({ candidate: fixture.source, expectedCommit: fixture.build.commit, expectedSource: fixture.expectedSource, run });
  assertExpectedBuild({ candidate: fixture.source, expectedCommit: fixture.build.commit, run });
});
