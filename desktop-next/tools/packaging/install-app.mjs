// Puts the packaged "Vanta.app" where a person can open it.
// Touches only the destination app folder and one launcher file; never /Applications/Vanta.app,
// ~/.vanta or the `vanta` command.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const LAUNCHER_MARKER = "# vanta-next launcher (written by `npm run vanta:install`)";

/** The `vanta-next` shell launcher: opens the installed app, or says exactly how to install it. */
export function launcherScript(appPath) {
  return [
    "#!/bin/sh",
    LAUNCHER_MARKER,
    `APP="${appPath}"`,
    'if [ ! -d "$APP" ]; then',
    `  echo 'Vanta is not installed at '"$APP"'. Run: npm run vanta:install (in desktop-next).' >&2`,
    "  exit 1",
    "fi",
    'exec open "$APP" --args "$@"',
    "",
  ].join("\n");
}

/** Copies the built app over the previous copy of the same app, keeping signature and symlinks intact. */
export function installApp({ source, destDir, name }) {
  if (!fs.existsSync(path.join(source, "Contents", "Info.plist"))) {
    throw new Error(`No built app at ${source}. Run \`npm run vanta:package\` in desktop-next first.`);
  }
  const target = path.join(destDir, `${name}.app`);
  fs.mkdirSync(destDir, { recursive: true });
  fs.rmSync(target, { recursive: true, force: true });
  execFileSync("ditto", [source, target]);
  return target;
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
