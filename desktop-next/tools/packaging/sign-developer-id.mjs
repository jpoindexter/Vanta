// Developer ID signing for a distributable build: hardened runtime, secure timestamp, entitlements.
// Inside out: every loose Mach-O first, then nested bundles deepest first, then the app itself.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { looseExecutables } from "./sign-app.mjs";

const BUNDLE_SUFFIXES = [".app", ".framework", ".xpc"];

function* walkDirs(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    yield full;
    yield* walkDirs(full);
  }
}

/** Nested bundles under a folder, deepest first, so a bundle is signed after everything inside it. */
export function nestedBundles(dir) {
  const bundles = [...walkDirs(dir)].filter((full) => BUNDLE_SUFFIXES.some((suffix) => full.endsWith(suffix)));

  return bundles.sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);
}

/** The ordered list of things to sign: loose Mach-O files, then bundles deepest first, then the app. */
export function signingOrder({ app, looseDirs }) {
  const frameworks = path.join(app, "Contents", "Frameworks");
  const dirs = [...looseDirs, ...(fs.existsSync(frameworks) ? [frameworks] : [])];
  const files = dirs.flatMap((dir) => looseExecutables(dir));
  const bundles = fs.existsSync(frameworks) ? nestedBundles(frameworks) : [];

  return { files, bundles, app };
}

/** The codesign arguments for one item. The identity is a certificate name or its SHA-1 hash (two certificates may share a name). */
export function codesignArgs({ identity, entitlements, target, withEntitlements }) {
  return [
    "--force",
    "--timestamp",
    "--options",
    "runtime",
    ...(withEntitlements ? ["--entitlements", entitlements] : []),
    "--sign",
    identity,
    target
  ];
}

const codesign = (args) => execFileSync("codesign", args, { stdio: ["ignore", "pipe", "pipe"] });

export function signDeveloperId({ app, looseDirs, identity, entitlements }) {
  execFileSync("xattr", ["-cr", app]);
  const { files, bundles } = signingOrder({ app, looseDirs });

  for (const target of files) codesign(codesignArgs({ identity, entitlements, target, withEntitlements: false }));
  for (const target of bundles) codesign(codesignArgs({ identity, entitlements, target, withEntitlements: true }));
  codesign(codesignArgs({ identity, entitlements, target: app, withEntitlements: true }));
  codesign(["--verify", "--deep", "--strict", "--verbose=2", app]);

  return { looseSigned: files.length, bundlesSigned: bundles.length, identity };
}
