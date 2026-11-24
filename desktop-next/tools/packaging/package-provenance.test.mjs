import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assertSourceUnchanged, captureSource, fingerprintInputs } from "./package-provenance.mjs";
import { assembleApp } from "./assemble-app.mjs";
import { readPlist } from "./plist.mjs";
import * as asar from "@electron/asar";

function sourceFixture(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-source-proof-"));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  fs.mkdirSync(path.join(repo, "src"));
  fs.writeFileSync(path.join(repo, "src", "agent.ts"), "export const state = 1;\n");
  let dirty = false;
  const run = (_command, args) => {
    if (args[0] === "rev-parse") return args[1] === "--show-toplevel" ? repo : "a".repeat(40);
    if (args[0] === "ls-files") return "src/agent.ts\0";
    return dirty ? " M src/agent.ts\0" : "";
  };
  return { repo, run, makeDirty: () => { dirty = true; } };
}

test("dirty edits change source provenance without rewriting the source commit", (t) => {
  const fixture = sourceFixture(t);
  const before = captureSource(fixture.repo, fixture);
  fixture.makeDirty();
  fs.appendFileSync(path.join(fixture.repo, "src", "agent.ts"), "export const changed = true;\n");
  const after = captureSource(fixture.repo, fixture);
  assert.equal(before.fullCommit, after.fullCommit);
  assert.equal(before.dirty, false);
  assert.equal(after.dirty, true);
  assert.notEqual(before.source.sha256, after.source.sha256);
  assert.throws(() => assertSourceUnchanged(before, after), /changed during the build/);
  assertSourceUnchanged(after, captureSource(fixture.repo, fixture));
});

test("non-Git snapshots and inherited parent Git roots cannot claim HEAD", (t) => {
  const fixture = sourceFixture(t);
  assert.throws(() => captureSource(fixture.repo), /authoritative Git checkout/);
  assert.throws(() => captureSource(fixture.repo, { run: () => os.tmpdir() }), /Git root does not match/);
});

test("new source inputs change provenance even when absent from the Git file listing", (t) => {
  const fixture = sourceFixture(t);
  const before = captureSource(fixture.repo, fixture);
  fs.writeFileSync(path.join(fixture.repo, "src", "ignored-helper.ts"), "export const value = 2;");
  const after = captureSource(fixture.repo, fixture);
  assert.notEqual(before.source.sha256, after.source.sha256);
  assert.equal(after.source.files, before.source.files + 1);
});

test("shared native helper edits invalidate source provenance at the same commit", (t) => {
  const fixture = sourceFixture(t);
  const native = path.join(fixture.repo, "vanta-ts", "desktop-native");
  fs.mkdirSync(native, { recursive: true });
  for (const file of ["runtime-env.mjs", "runtime-launch.mjs"]) {
    fs.writeFileSync(path.join(native, file), "export const value = 1;\n");
  }
  let before = captureSource(fixture.repo, fixture);
  for (const file of ["runtime-env.mjs", "runtime-launch.mjs"]) {
    fs.appendFileSync(path.join(native, file), "export const changed = true;\n");
    const after = captureSource(fixture.repo, fixture);
    assert.equal(after.fullCommit, before.fullCommit);
    assert.equal(after.source.files, before.source.files);
    assert.notEqual(after.source.sha256, before.source.sha256);
    assert.throws(() => assertSourceUnchanged(before, after), /changed during the build/);
    before = after;
  }
});

test("dotenv and secret-shaped files refuse before reading their contents", (t) => {
  const fixture = sourceFixture(t);
  fs.writeFileSync(path.join(fixture.repo, ".env.local"), "DO_NOT_HASH=this_is_not_an_input\n");
  assert.throws(() => captureSource(fixture.repo, fixture), /Unrecorded dotenv/);
  assert.throws(() => fingerprintInputs({ ".env": "/missing/never-read" }), /secret-shaped/);
  const secret = path.join(fixture.repo, "private.key");
  fs.writeFileSync(secret, "never index this");
  assert.throws(() => fingerprintInputs({ "private.key": secret }), /secret-shaped/);
});

test("exact input digest changes with bytes and modes and rejects outside links", (t) => {
  const fixture = sourceFixture(t);
  const file = path.join(fixture.repo, "src", "agent.ts");
  const before = fingerprintInputs({ source: path.dirname(file) });
  fs.chmodSync(file, 0o755);
  assert.notEqual(before.sha256, fingerprintInputs({ source: path.dirname(file) }).sha256);
  fs.symlinkSync(os.tmpdir(), path.join(fixture.repo, "src", "external"));
  assert.throws(() => fingerprintInputs({ source: path.dirname(file) }), /External package input link/);
});

test("fixture assembly retains build identity and embeds the exact provenance in both bundle locations", async (t) => {
  const { repo } = sourceFixture(t);
  const write = (file, body = "fixture") => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  };
  const desktop = path.join(repo, "desktop");
  for (const name of ["icon.png", "icon-mac.png", "trayTemplate.png", "trayTemplate@2x.png", "icon.icns"]) write(path.join(desktop, "assets", name));
  write(path.join(desktop, "dist", "electron-main.mjs"));
  const electronDist = path.join(repo, "electron");
  const base = path.join(electronDist, "Electron.app", "Contents");
  const plist = '<?xml version="1.0"?><plist version="1.0"><dict></dict></plist>';
  write(path.join(base, "Info.plist"), plist);
  write(path.join(base, "MacOS", "Electron"));
  write(path.join(base, "Resources", "default_app.asar"));
  for (const suffix of ["", " (GPU)", " (Plugin)", " (Renderer)"]) {
    const name = `Electron Helper${suffix}`;
    const helper = path.join(base, "Frameworks", `${name}.app`, "Contents");
    write(path.join(helper, "Info.plist"), plist);
    write(path.join(helper, "MacOS", name));
  }
  const runtime = path.join(repo, "runtime");
  write(path.join(runtime, "cli.mjs"));
  const kernel = path.join(repo, "kernel");
  write(kernel);
  const build = { version: "0.1.0", commit: "aaaaaaaa", builtAt: "fixture-clock", provenance: { source: { sha256: "b".repeat(64) } } };
  const out = path.join(repo, "out", "Vanta.app");
  await assembleApp({ out, config: { copyright: "Fixture", protocols: [], mac: { category: "public.app-category.productivity", extendInfo: {} } },
    identity: { displayName: "Vanta", appId: "studio.theft.vanta-next" }, build,
    paths: { desktop, electronDist, runtime, kernel, work: path.join(repo, "asar-work"), notices: [] } });
  const resources = path.join(out, "Contents", "Resources");
  const embedded = JSON.parse(asar.extractFile(path.join(resources, "app.asar"), "package.json"));
  assert.equal(embedded.vantaBuild.commit, build.commit);
  assert.deepEqual(embedded.vantaBuild.provenance, build.provenance);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(resources, "vanta-build-provenance.json"), "utf8")), build);
  assert.equal(readPlist(path.join(out, "Contents", "Info.plist")).VantaBuildCommit, build.commit);
});
