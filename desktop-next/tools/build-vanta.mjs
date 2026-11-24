// Builds what the Vanta desktop needs to open: the renderer (vite), the Electron main/preload pair and the precompiled
// Vanta runtime. The launcher prefers vanta-ts/dist-runtime when it exists, so a stale bundle would silently run old server code.
//   node tools/build-vanta.mjs
import { execFileSync } from "node:child_process";
import path from "node:path";
import { electronPackageRoot } from "./electron-dependency.mjs";

const desktop = path.resolve(import.meta.dirname, "..", "apps", "desktop");
const run = (args) => execFileSync(process.execPath, args, { cwd: desktop, stdio: "inherit" });

// Electron 42+ downloads its verified platform binary explicitly, not in postinstall.
run([path.join(electronPackageRoot(), "install.js")]);
run([path.resolve(desktop, "..", "..", "node_modules", "vite", "bin", "vite.js"), "build"]);
run([path.join(desktop, "scripts", "bundle-electron-main.mjs"), "--dev"]);
// The runtime bundle: rebuilt every time so the app never runs server code older than the source tree.
execFileSync(process.execPath, [path.join(desktop, "..", "..", "..", "vanta-ts", "scripts", "build-runtime-bundle.mjs")], { cwd: path.join(desktop, "..", "..", "..", "vanta-ts"), stdio: "inherit" });
