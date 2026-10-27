import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { deliveryReport, refreshDeliveryArchive } from "./delivery-archive.mjs";

const cli = fileURLToPath(new URL("../notarize-app.mjs", import.meta.url));

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-delivery-proof-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "Vanta.app");
  const resources = path.join(app, "Contents", "Resources");
  fs.mkdirSync(resources, { recursive: true });
  fs.writeFileSync(path.join(resources, "app.asar"), "fixture-only application bytes");
  fs.writeFileSync(path.join(app, "Contents", "Info.plist"), `<?xml version="1.0"?><plist version="1.0"><dict>
    <key>CFBundleIdentifier</key><string>studio.theft.vanta-next</string>
    <key>VantaBuildCommit</key><string>aaaaaaaa</string>
    <key>CFBundleShortVersionString</key><string>0.1.0</string>
    <key>CFBundleVersion</key><string>0.1.0</string></dict></plist>`);
  const build = { commit: "aaaaaaaa", version: "0.1.0", builtAt: "2026-10-27T00:00:00.000Z", provenance: {
    schema: 1, fullCommit: "a".repeat(40), dirty: true,
    source: { sha256: "b".repeat(64), files: 1 }, assembly: { sha256: "c".repeat(64), files: 1 },
  } };
  fs.writeFileSync(path.join(resources, "vanta-build-provenance.json"), JSON.stringify(build));
  const zip = path.join(root, "Vanta-0.1.0-arm64.zip");
  fs.writeFileSync(zip, "previous-delivery-archive");
  const reportPath = path.join(root, "bundle-report.json");
  const report = { app, zip, build, identity: "original-signing-identity", packages: 14 };
  fs.writeFileSync(reportPath, JSON.stringify(report));
  return { root, app, resources, report, reportPath, zip };
}

function mockNative(f) {
  const bin = path.join(f.root, "mock-native");
  fs.mkdirSync(bin);
  const script = `#!${process.execPath}
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_LOG, JSON.stringify([command, ...args]) + '\\n');
if (command === 'ditto') {
  const result = spawnSync('/usr/bin/ditto', args, { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
if (command === 'xcrun' && args[0] === 'notarytool') {
  console.log(JSON.stringify({ status: args[1] === 'submit' ? process.env.FIXTURE_VERDICT : 'ok' }));
} else if (command === 'xcrun' && args[0] === 'stapler') {
  const ticket = path.join(args[2], 'Contents', 'fixture-stapled-ticket');
  if (args[1] === 'staple') {
    if (process.env.FIXTURE_STAPLE_FAIL) process.exit(7);
    fs.writeFileSync(ticket, 'post-staple artifact');
  } else if (!fs.existsSync(ticket)) process.exit(8);
}
`;
  for (const name of ["ditto", "xcrun", "spctl", "codesign"]) {
    fs.writeFileSync(path.join(bin, name), script, { mode: 0o755 });
  }
  return { ...process.env, PATH: `${bin}:${process.env.PATH}`, FIXTURE_LOG: path.join(f.root, "native-log.jsonl"), FIXTURE_VERDICT: "Accepted" };
}

test("actual notary entry rebuilds delivery ZIP after staple and proves final archive bytes", (t) => {
  const f = fixture(t);
  const env = mockNative(f);
  const result = spawnSync(process.execPath, [cli, "--app", f.app, "--profile", "fixture-only"], { env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(fs.readFileSync(f.reportPath, "utf8"));
  assert.deepEqual(report.build, f.report.build);
  assert.equal(report.identity, f.report.identity);
  assert.equal(report.packages, 14);
  assert.equal(report.delivery.sha256, createHash("sha256").update(fs.readFileSync(f.zip)).digest("hex"));
  const extracted = path.join(f.root, "independent-readback");
  execFileSync("/usr/bin/ditto", ["-x", "-k", f.zip, extracted]);
  assert.equal(fs.readFileSync(path.join(extracted, "Vanta.app", "Contents", "fixture-stapled-ticket"), "utf8"), "post-staple artifact");
  const log = fs.readFileSync(env.FIXTURE_LOG, "utf8").trim().split("\n").map(JSON.parse);
  const staple = log.findIndex((row) => row[0] === "xcrun" && row[1] === "stapler" && row[2] === "staple");
  const zipCalls = log.flatMap((row, index) => row[0] === "ditto" && row[1] === "-c" ? [index] : []);
  assert.equal(zipCalls.length, 2);
  assert.ok(zipCalls[0] < staple && staple < zipCalls[1]);
  assert.ok(log.some((row) => row[0] === "codesign" && row.includes("--strict")));
});

for (const failure of ["rejected", "staple", "missing-provenance"]) {
  test(`actual notary entry preserves previous ZIP/report on ${failure}`, (t) => {
    const f = fixture(t);
    const env = mockNative(f);
    if (failure === "rejected") env.FIXTURE_VERDICT = "Invalid";
    if (failure === "staple") env.FIXTURE_STAPLE_FAIL = "yes";
    if (failure === "missing-provenance") fs.unlinkSync(path.join(f.resources, "vanta-build-provenance.json"));
    const before = fs.readFileSync(f.reportPath);
    const result = spawnSync(process.execPath, [cli, "--app", f.app, "--profile", "fixture-only"], { env, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.equal(fs.readFileSync(f.zip, "utf8"), "previous-delivery-archive");
    assert.deepEqual(fs.readFileSync(f.reportPath), before);
    if (failure === "missing-provenance") assert.equal(fs.existsSync(env.FIXTURE_LOG), false);
  });
}

test("mismatched source report and outside delivery destinations refuse", (t) => {
  const f = fixture(t);
  f.report.build.commit = "dddddddd";
  fs.writeFileSync(f.reportPath, JSON.stringify(f.report));
  assert.throws(() => deliveryReport(f.app), /source provenance/);
  f.report.build.commit = "aaaaaaaa";
  f.report.zip = path.join(os.tmpdir(), "Vanta-0.1.0-arm64.zip");
  fs.writeFileSync(f.reportPath, JSON.stringify(f.report));
  assert.throws(() => deliveryReport(f.app), /archive path/);
});

test("failed archived signature proof preserves previous archive and report", (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.app, "Contents", "fixture-stapled-ticket"), "already stapled");
  const before = fs.readFileSync(f.reportPath);
  const run = (command, args) => {
    if (command === "codesign") throw new Error("fixture invalid signature");
    if (command !== "xcrun") return execFileSync(command === "ditto" ? "/usr/bin/ditto" : command, args, { encoding: "utf8" });
  };
  assert.throws(() => refreshDeliveryArchive(f.app, { run }), /invalid signature/);
  assert.equal(fs.readFileSync(f.zip, "utf8"), "previous-delivery-archive");
  assert.deepEqual(fs.readFileSync(f.reportPath), before);
});
