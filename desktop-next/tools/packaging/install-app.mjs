// Puts the packaged "Vanta.app" where a person can open it.
// Reuses the local updater's staged, verified replacement and retained rollback.
// Never quits Vanta, changes its profile, or rewrites the `vanta` command.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { hasRunningDesktop, installLocalDesktop } from "../../../vanta-ts/scripts/lib/desktop-local-install.mjs";

export const LAUNCHER_MARKER = "# vanta-next launcher (written by `npm run vanta:install`)";

/** The `vanta-next` shell launcher: opens the installed app, or says exactly how to install it. */
export function launcherScript(appPath) {
  return [
    "#!/bin/sh",
    LAUNCHER_MARKER,
    `APP='${appPath.replaceAll("'", "'\\''")}'`,
    'if [ ! -d "$APP" ]; then',
    `  echo 'Vanta is not installed at '"$APP"'. Run: npm run vanta:install (in desktop-next).' >&2`,
    "  exit 1",
    "fi",
    'exec open "$APP" --args "$@"',
    "",
  ].join("\n");
}

const bundlesOverlap = (candidate, target) => candidate === target
  || candidate.startsWith(`${target}${path.sep}`) || target.startsWith(`${candidate}${path.sep}`);

function installationDirectory(destDir) {
  const directory = path.resolve(destDir);
  let ancestor = directory;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const resolved = path.join(fs.realpathSync(ancestor), path.relative(ancestor, directory));
  if (resolved.split(path.sep).some(part => /\.app$/i.test(part))) throw new Error("Refusing an installation directory inside another app bundle.");
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function installationPaths({ source, destDir, name }) {
  if (!fs.existsSync(path.join(source, "Contents", "Info.plist"))) {
    throw new Error(`No built app at ${source}. Run \`npm run vanta:package\` in desktop-next first.`);
  }
  if (name !== "Vanta" || !path.isAbsolute(source) || !path.isAbsolute(destDir) || path.parse(destDir).root === destDir) {
    throw new Error("Expected an absolute Vanta.app candidate and destination directory.");
  }
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error("Refusing a symlink bundle.");
  const target = path.join(installationDirectory(destDir), "Vanta.app");
  const candidate = fs.realpathSync(source);
  if (bundlesOverlap(candidate, target)) {
    throw new Error("Candidate and destination must be separate bundles.");
  }
  const backupRoot = path.join(path.dirname(target), ".vanta-install-backups");
  if (fs.existsSync(backupRoot) && fs.lstatSync(backupRoot).isSymbolicLink()) throw new Error("Refusing a symlink rollback target.");
  return { candidate, target, backupRoot };
}

/** Installs only the regular Vanta identity; returns the retained rollback receipt. */
export async function installApp({ source, destDir, name, run = execFileSync }) {
  const { candidate, target, backupRoot } = installationPaths({ source, destDir, name });
  const assertStopped = () => {
    const processes = run("ps", ["-axo", "comm="], { encoding: "utf8" });
    if (hasRunningDesktop(processes, target)) throw new Error("Quit Vanta after saving your work, then install again. No app was replaced.");
  };
  const verify = bundle => {
    const id = run("plutil", ["-extract", "CFBundleIdentifier", "raw", path.join(bundle, "Contents", "Info.plist")], { encoding: "utf8" }).trim();
    if (id !== "studio.theft.vanta-next") throw new Error("Candidate or installed app has the wrong Vanta bundle identifier.");
    run("codesign", ["--verify", "--deep", "--strict", bundle], { stdio: "inherit" });
  };
  assertStopped();
  if (fs.existsSync(target)) verify(target);
  return installLocalDesktop({ candidate, target, backupRoot, verify, assertStopped });
}

/** Writes the launcher, refusing to replace a file this installer did not write. */
export function installLauncher({ binDir, appPath, name = "vanta-next" }) {
  const file = path.join(binDir, name);
  if (fs.existsSync(file) && !fs.readFileSync(file, "utf8").includes(LAUNCHER_MARKER)) {
    throw new Error(`${file} already exists and was not written by vanta:install. Move it, or remove it, then run again.`);
  }
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(file, launcherScript(appPath), { mode: 0o755 });
  return file;
}
