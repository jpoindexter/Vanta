// Installs the current build as "Vanta Next.app" in ~/Applications and adds a `vanta-next` command.
//
//   npm run vanta:install            package first, then install
//   npm run vanta:install -- --no-package   install the app already built under apps/desktop/release
//
// Side by side with the existing app (separate app id). Nothing is signed with a real identity,
// notarized or uploaded; the existing /Applications/Vanta.app and the `vanta` command are untouched.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import { installApp, installLauncher } from "./packaging/install-app.mjs";

const require = createRequire(import.meta.url);
const next = path.resolve(import.meta.dirname, "..");
const identity = require("../apps/desktop/product-identity.cjs");
const built = path.join(next, "apps", "desktop", "release", "mac-arm64", `${identity.displayName}.app`);

if (!process.argv.includes("--no-package")) {
  execFileSync(process.execPath, [path.join(import.meta.dirname, "package-vanta.mjs")], { cwd: next, stdio: "inherit" });
}

const destDir = process.env.VANTA_INSTALL_APPS_DIR ?? path.join(os.homedir(), "Applications");
const binDir = process.env.VANTA_INSTALL_BIN_DIR ?? path.join(os.homedir(), ".local", "bin");
const appPath = installApp({ source: built, destDir, name: identity.displayName });
execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], { stdio: "inherit" });
const launcher = installLauncher({ binDir, appPath });

console.log(`Installed ${appPath}\nLauncher: ${launcher}  (run \`vanta-next\`, or open the app from ~/Applications)`);
console.log(`The \`vanta\` command and /Applications/Vanta.app are unchanged.`);
if (!fs.existsSync(path.join(appPath, "Contents", "Resources", "icon.icns"))) console.warn("Warning: the app has no icon.icns.");
