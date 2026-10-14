// Facts about a built .app: size, the largest files, symlinks that leave the bundle, and leftover Nous/Hermes strings.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as asar from "@electron/asar";

const LEGACY_BRAND = /nous|hermes/i;
const MAX_TEXT_BYTES = 30 * 1024 * 1024;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) yield { file: full, link: true };
    else if (entry.isDirectory()) yield* walk(full);
    else yield { file: full, link: false };
  }
}

/** Disk usage in MB and the ten biggest regular files. */
export function sizeFacts(app) {
  const kb = Number(execFileSync("du", ["-sk", app]).toString().split("\t")[0]);
  const files = [...walk(app)].filter((entry) => !entry.link).map(({ file }) => ({ file, bytes: fs.statSync(file).size }));
  files.sort((a, b) => b.bytes - a.bytes);
  const top = files.slice(0, 10).map(({ file, bytes }) => ({ path: path.relative(app, file), mb: Math.round((bytes / 1048576) * 10) / 10 }));
  return { mb: Math.round(kb / 1024), top };
}

/** Symlinks in the bundle, split into framework links that stay inside it and anything else (the failures). */
export function symlinkFacts(app) {
  const root = fs.realpathSync(app);
  const all = [...walk(app)].filter((entry) => entry.link).map(({ file }) => file);
  const escaping = all.filter((link) => {
    try {
      return !fs.realpathSync(link).startsWith(`${root}${path.sep}`);
    } catch {
      return true;
    }
  });
  const inRuntime = all.filter((link) => link.includes(`${path.sep}vanta-runtime${path.sep}`));
  return {
    total: all.length,
    escaping: escaping.map((link) => path.relative(app, link)),
    inRuntime: inRuntime.map((link) => path.relative(app, link)),
  };
}

function countLegacy(dir) {
  let files = 0;
  let hits = 0;
  for (const { file, link } of walk(dir)) {
    if (link) continue;
    const { size } = fs.statSync(file);
    if (size > MAX_TEXT_BYTES) continue;
    const matches = fs.readFileSync(file).toString("latin1").match(new RegExp(LEGACY_BRAND, "gi"));
    if (matches) {
      files += 1;
      hits += matches.length;
    }
  }
  return { files, hits };
}

/** Nous/Hermes occurrences: in Info.plists, the asar, our own runtime files, and (separately) third-party node_modules. */
export function legacyBrandFacts(app) {
  const resources = path.join(app, "Contents", "Resources");
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-asar-"));
  try {
    asar.extractAll(path.join(resources, "app.asar"), scratch);
    const runtime = path.join(resources, "vanta-runtime");
    const plists = [path.join(app, "Contents", "Info.plist")];
    const plistText = plists.map((file) => execFileSync("plutil", ["-p", file]).toString()).join("\n");
    const ownRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "vanta-own-"));
    for (const name of ["dist-runtime", "src", "package.json"]) {
      const from = path.join(runtime, name);
      if (fs.existsSync(from)) fs.cpSync(from, path.join(ownRuntime, name), { recursive: true });
    }
    const result = {
      infoPlist: (plistText.match(new RegExp(LEGACY_BRAND, "gi")) ?? []).length,
      asar: countLegacy(scratch),
      runtimeSources: countLegacy(ownRuntime),
      thirdPartyModules: countLegacy(path.join(runtime, "node_modules")),
    };
    fs.rmSync(ownRuntime, { recursive: true, force: true });
    return result;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
