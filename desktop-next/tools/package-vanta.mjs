// One command for a local, unsigned-identity "Vanta Next.app" (arm64):
//   npm run vanta:package            (from desktop-next)
// Builds the renderer + Electron main, the precompiled Vanta runtime and (if missing) the release kernel,
// assembles the app from the Electron already in node_modules, ad-hoc signs it and zips it.
// Nothing is downloaded, notarized, uploaded or installed.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { assembleApp } from "./packaging/assemble-app.mjs";
import { legacyBrandFacts, sizeFacts, symlinkFacts } from "./packaging/bundle-report.mjs";
import { signAdHoc } from "./packaging/sign-app.mjs";
import { stageRuntime } from "./packaging/stage-runtime.mjs";

const require = createRequire(import.meta.url);
const next = path.resolve(import.meta.dirname, "..");
const repo = path.resolve(next, "..");
const desktop = path.join(next, "apps", "desktop");
const vantaTs = path.join(repo, "vanta-ts");
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: "inherit" });

/** The kernel to ship: VANTA_KERNEL_BIN, else target/release (built here with cargo when missing), else target/debug. */
function resolveKernel() {
  if (process.env.VANTA_KERNEL_BIN) return { file: process.env.VANTA_KERNEL_BIN, profile: "custom" };
  const release = path.join(repo, "target", "release", "vanta-kernel");
  if (!fs.existsSync(release)) {
    try {
      run("cargo", ["build", "--release", "--locked", "--offline", "--bin", "vanta-kernel"], repo);
    } catch {
      console.warn("[package] cargo release build unavailable; falling back to the debug kernel.");
    }
  }
  if (fs.existsSync(release)) return { file: release, profile: "release" };
  return { file: path.join(repo, "target", "debug", "vanta-kernel"), profile: "debug" };
}

function gitFacts() {
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  return { commit: git("rev-parse", "--short=8", "HEAD"), builtAt: new Date().toISOString() };
}

function buildInputs() {
  console.log("[package] build renderer + electron main");
  run(process.execPath, [path.join(import.meta.dirname, "build-vanta.mjs")], next);
  console.log("[package] build runtime bundle");
  run("npm", ["run", "desktop:runtime"], vantaTs);
  const kernel = resolveKernel();
  if (!fs.existsSync(kernel.file)) throw new Error(`No kernel at ${kernel.file}. Build it (cargo build --release) or set VANTA_KERNEL_BIN.`);
  return kernel;
}

const noticeFiles = (electronDist) => [
  [path.join(next, "LICENSE-HERMES-MIT"), "LICENSE-HERMES-MIT"],
  [path.join(next, "NOTICE.md"), "NOTICE.md"],
  [path.join(repo, "LICENSE"), "LICENSE"],
  [path.join(electronDist, "LICENSE"), "LICENSE.electron"],
  [path.join(electronDist, "LICENSES.chromium.html"), "LICENSES.chromium.html"],
];

function sealAndReport({ app, outDir, build, kernel, packages, name }) {
  console.log("[package] ad-hoc sign");
  const resources = path.join(app, "Contents", "Resources");
  const signed = signAdHoc({ app, looseDirs: [path.join(resources, "vanta-runtime"), path.join(resources, "kernel")] });
  const zip = path.join(outDir, `${name.replace(/ /g, "-")}-${build.version}-arm64.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, zip]);
  const report = { app, zip, zipMb: Math.round(fs.statSync(zip).size / 1048576), kernel, build, packages, ...signed, size: sizeFacts(app), symlinks: symlinkFacts(app), legacy: legacyBrandFacts(app) };
  fs.writeFileSync(path.join(outDir, "bundle-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const config = require("../apps/desktop/electron-builder.config.cjs");
  const identity = require("../apps/desktop/product-identity.cjs");
  const build = { version: process.env.VANTA_NEXT_VERSION ?? "0.1.0", ...gitFacts() };
  const outDir = path.join(desktop, "release", "mac-arm64");
  const app = path.join(outDir, `${identity.displayName}.app`);
  const scratch = path.join(desktop, "build", "packager");
  const kernel = buildInputs();

  console.log("[package] stage runtime");
  const { packages } = stageRuntime({ vantaTs, dest: path.join(scratch, "vanta-runtime") });
  console.log("[package] assemble app");
  const electronDist = path.join(desktop, "node_modules", "electron", "dist");
  const paths = { desktop, electronDist, kernel: kernel.file, runtime: path.join(scratch, "vanta-runtime"), work: path.join(scratch, "asar"), notices: noticeFiles(electronDist) };
  await assembleApp({ out: app, config, identity, build, paths });
  sealAndReport({ app, outDir, build, kernel, packages, name: identity.displayName });
}

await main();
