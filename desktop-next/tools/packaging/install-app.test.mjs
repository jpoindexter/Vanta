import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { afterEach } from "node:test";

import { installApp, installLauncher, LAUNCHER_MARKER, launcherScript } from "./install-app.mjs";

const roots = [];
const tmp = () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vanta-install-test-")));
  roots.push(root);
  return root;
};
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));

function fakeApp(root, content = "new", id = "studio.theft.vanta-next") {
  const app = path.join(root, "Vanta.app");
  fs.mkdirSync(path.join(app, "Contents", "Resources"), { recursive: true });
  fs.writeFileSync(path.join(app, "Contents", "Info.plist"), JSON.stringify({ CFBundleIdentifier: id }));
  fs.writeFileSync(path.join(app, "Contents", "Resources", "icon.icns"), "icns");
  fs.writeFileSync(path.join(app, "Contents", "Resources", "app.asar"), content);
  return app;
}

function fixture() {
  const root = tmp();
  const destDir = path.join(root, "Applications");
  const source = fakeApp(path.join(root, "built"));
  const target = fakeApp(destDir, "old");
  const run = (command, args) => {
    if (command === "ps") return "";
    if (command === "plutil") return JSON.parse(fs.readFileSync(args.at(-1), "utf8")).CFBundleIdentifier;
    assert.equal(command, "codesign");
  };
  return { root, target, source, destDir, name: "Vanta", run };
}

const content = app => fs.readFileSync(path.join(app, "Contents", "Resources", "app.asar"), "utf8");

test("installs the exact app and preserves the previous app with a receipt", async () => {
  const options = fixture();
  fs.mkdirSync(path.join(options.destDir, "Other.app"));
  const receipt = await installApp(options);
  assert.equal(receipt.target, options.target);
  assert.equal(content(receipt.target), "new");
  assert.equal(content(receipt.backup), "old");
  assert.equal(JSON.parse(fs.readFileSync(receipt.receiptPath)).installedSha256, receipt.installedSha256);
  assert.ok(fs.existsSync(path.join(options.destDir, "Other.app")));
});

test("says how to build when there is no built app", async () => {
  await assert.rejects(installApp({ source: path.join(tmp(), "none.app"), destDir: tmp(), name: "Vanta" }), /npm run vanta:package/);
});

test("first installation records that there was no previous app", async () => {
  const options = fixture();
  fs.renameSync(options.target, path.join(options.root, "NotInstalled.app"));
  const receipt = await installApp(options);
  assert.equal(receipt.backup, null);
  assert.equal(content(receipt.target), "new");
});

test("refuses a running app without creating any staging or backup", async () => {
  const options = fixture();
  await assert.rejects(installApp({ ...options, run: () => `${options.target}/Contents/MacOS/Vanta` }), /Quit Vanta/);
  assert.equal(content(options.target), "old");
  assert.deepEqual(fs.readdirSync(options.destDir), ["Vanta.app"]);
});

test("rechecks running state after staging", async () => {
  const options = fixture();
  let checks = 0;
  const run = (command, args) => command === "ps" && ++checks === 3
    ? `${options.target}/Contents/MacOS/Vanta` : options.run(command, args);
  await assert.rejects(installApp({ ...options, run }), /Quit Vanta/);
  assert.equal(content(options.target), "old");
});

test("rejects a wrong candidate or installed bundle identity", async () => {
  for (const which of ["source", "target"]) {
    const options = fixture();
    fs.writeFileSync(path.join(options[which], "Contents", "Info.plist"), JSON.stringify({ CFBundleIdentifier: "unrelated.app" }));
    await assert.rejects(installApp(options), /wrong Vanta bundle/);
    assert.equal(content(options.target), "old");
  }
});

test("failed staged signature validation leaves the old app in place", async () => {
  const options = fixture();
  const run = (command, args) => {
    if (command === "codesign" && args.at(-1).includes(".vanta-update-")) throw new Error("invalid staged signature");
    return options.run(command, args);
  };
  await assert.rejects(installApp({ ...options, run }), /invalid staged signature/);
  assert.equal(content(options.target), "old");
});

test("a changed staged archive is rejected before replacing the old app", async () => {
  const options = fixture();
  const run = (command, args) => {
    if (command === "codesign" && args.at(-1).includes(".vanta-update-")) {
      fs.writeFileSync(path.join(args.at(-1), "Contents", "Resources", "app.asar"), "changed");
    }
    return options.run(command, args);
  };
  await assert.rejects(installApp({ ...options, run }), /Staged app does not match/);
  assert.equal(content(options.target), "old");
});

test("failed installed validation restores the old app and retains the rejected candidate", async () => {
  const options = fixture();
  const run = (command, args) => {
    if (command === "codesign" && args.at(-1) === options.target && content(options.target) === "new") throw new Error("invalid installed signature");
    return options.run(command, args);
  };
  await assert.rejects(installApp({ ...options, run }), /invalid installed signature/);
  assert.equal(content(options.target), "old");
  const backups = path.join(options.destDir, ".vanta-install-backups");
  const rejected = path.join(backups, fs.readdirSync(backups)[0], "Rejected-Vanta.app");
  assert.equal(content(rejected), "new");
});

test("refuses source/target overlap and traversal names", async () => {
  const options = fixture();
  await assert.rejects(installApp({ ...options, destDir: path.dirname(options.source) }), /separate bundles/);
  await assert.rejects(installApp({ ...options, name: "../Other" }), /absolute Vanta/);
  assert.equal(content(options.target), "old");
});

test("rejects destinations inside unrelated app bundles, including a symlink alias, before creating directories", async () => {
  const options = fixture();
  const other = path.join(options.destDir, "Other.app");
  const alias = path.join(options.root, "Alias");
  fs.mkdirSync(other);
  fs.writeFileSync(path.join(other, "sentinel"), "unchanged");
  fs.symlinkSync(other, alias);
  for (const destDir of [other, path.join(alias, "new-directory")]) {
    await assert.rejects(installApp({ ...options, destDir }), /inside another app bundle/);
    assert.deepEqual(fs.readdirSync(other), ["sentinel"]);
    assert.equal(fs.readFileSync(path.join(other, "sentinel"), "utf8"), "unchanged");
  }
  assert.equal(content(options.target), "old");
});

test("refuses symlink bundles and rollback directories", async () => {
  for (const which of ["source", "target", "backup"]) {
    const options = fixture();
    const link = which === "backup" ? path.join(options.destDir, ".vanta-install-backups") : options[which];
    if (which !== "backup") fs.renameSync(link, `${link}.saved`);
    fs.symlinkSync(which === "backup" ? options.root : `${link}.saved`, link);
    await assert.rejects(installApp(options), /symlink/);
    assert.equal(content(which === "target" ? `${link}.saved` : options.target), "old");
  }
});

test("the launcher treats shell metacharacters in its installed path as literal data", () => {
  const root = tmp();
  const appPath = path.join(root, "don't expand $HOME $(id).app");
  fs.mkdirSync(appPath);
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "open"), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
  const output = execFileSync("/bin/sh", ["-c", launcherScript(appPath)], { encoding: "utf8", env: { PATH: bin } });
  assert.equal(output.trim(), `${appPath}\n--args`);
});

test("the launcher opens the app and explains a missing install", () => {
  const script = launcherScript("/Users/x/Applications/Vanta Next.app");
  assert.match(script, /exec open "\$APP" --args "\$@"/);
  assert.match(script, /npm run vanta:install/);
  // Backticks or $( ) in an executable line would run a command instead of printing it (comments are inert).
  const code = script.split("\n").filter((line) => !line.startsWith("#")).join("\n");
  assert.ok(!code.includes("`"), "the launcher must not contain backticks");
  assert.ok(!/\$\(/.test(code), "the launcher must not contain command substitution");
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
