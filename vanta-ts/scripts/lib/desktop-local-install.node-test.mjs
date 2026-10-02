import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { installLocalDesktop, appDigest, hasRunningDesktop } from "./desktop-local-install.mjs";

test("running-window guard distinguishes the shared kernel from Desktop processes", () => {
  const target = "/Applications/Vanta.app";
  assert.equal(hasRunningDesktop(`${target}/Contents/Resources/kernel/vanta-kernel`, target), false);
  assert.equal(hasRunningDesktop(`${target}/Contents/MacOS/Vanta`, target), true);
  assert.equal(hasRunningDesktop(`${target}/Contents/Frameworks/Vanta Helper.app/Contents/MacOS/Vanta Helper`, target), true);
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "vanta-update-test-"));
  const candidate = join(root, "build", "Vanta.app");
  const target = join(root, "Applications", "Vanta.app");
  for (const [app, content] of [[candidate, "new"], [target, "old"]]) {
    await mkdir(join(app, "Contents", "Resources"), { recursive: true });
    await writeFile(join(app, "Contents", "Resources", "app.asar"), content);
  }
  const options = { candidate, target, backupRoot: join(root, "backups"), verify: async () => {}, assertStopped: () => {} };
  return { ...options, root };
}

test("installs the exact candidate and retains the previous bundle with a receipt", async () => {
  const options = await fixture();
  const before = await appDigest(options.target);
  const receipt = await installLocalDesktop(options);
  assert.equal(await appDigest(options.target), await appDigest(options.candidate));
  assert.equal(await appDigest(receipt.backup), before);
  assert.equal(JSON.parse(await readFile(receipt.receiptPath, "utf8")).installedSha256, receipt.installedSha256);
});

test("a running app stops installation before changing either bundle", async () => {
  const options = await fixture();
  const before = await appDigest(options.target);
  await assert.rejects(installLocalDesktop({ ...options, assertStopped() { throw new Error("Quit Vanta"); } }), /Quit Vanta/);
  assert.equal(await appDigest(options.target), before);
});

test("invalid candidate never replaces the installed app", async () => {
  const options = await fixture();
  const before = await appDigest(options.target);
  await assert.rejects(installLocalDesktop({ ...options, verify: async () => { throw new Error("invalid signature"); } }), /invalid signature/);
  assert.equal(await appDigest(options.target), before);
});

test("rechecks running state after staging, before replacement", async () => {
  const options = await fixture();
  const before = await appDigest(options.target);
  let checks = 0;
  await assert.rejects(installLocalDesktop({ ...options, assertStopped() { if (++checks === 2) throw new Error("launched during update"); } }), /launched during update/);
  assert.equal(await appDigest(options.target), before);
});

test("failed installed validation restores the old app and preserves the rejected candidate", async () => {
  const options = await fixture();
  const before = await appDigest(options.target);
  const verify = async (path) => { if (path === options.target) throw new Error("installed validation failed"); };
  await assert.rejects(installLocalDesktop({ ...options, verify }), /installed validation failed/);
  assert.equal(await appDigest(options.target), before);
});

test("cannot replace a broad directory or install over the candidate", async () => {
  const options = await fixture();
  await assert.rejects(installLocalDesktop({ ...options, target: options.root }), /Vanta.app/);
  await assert.rejects(installLocalDesktop({ ...options, target: options.candidate }), /different/);
});
