// Installs the current build as "Vanta.app" in /Applications and adds a `vanta-next` command.
//
//   npm run vanta:install            package first, then install
//   npm run vanta:install -- --no-package   install the app already built under apps/desktop/release
//
// Replaces only an idle, verified Vanta.app after staging and validation, retaining rollback.
// Packaging may use a configured signing identity; this command does not notarize or upload.
// Profiles and the `vanta` command are untouched.
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

const destDir = process.env.VANTA_INSTALL_APPS_DIR ?? "/Applications";
const binDir = process.env.VANTA_INSTALL_BIN_DIR ?? path.join(os.homedir(), ".local", "bin");
const receipt = await installApp({ source: built, destDir, name: identity.displayName });
const appPath = receipt.target;
console.log(`Installed ${appPath}\nRollback: ${receipt.backup ?? "no previous app"}\nReceipt: ${receipt.receiptPath}`);
const launcher = installLauncher({ binDir, appPath });

console.log(`Launcher: ${launcher}  (run \`vanta-next\`, or open the app at ${appPath})`);
console.log("The `vanta` command and user profiles are unchanged. No notarization or release was performed.");
if (!fs.existsSync(path.join(appPath, "Contents", "Resources", "icon.icns"))) console.warn("Warning: the app has no icon.icns.");
