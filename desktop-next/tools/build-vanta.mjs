// Builds what the Vanta desktop needs to open: the renderer (vite) and the Electron main/preload pair.
//   node tools/build-vanta.mjs
import { execFileSync } from "node:child_process";
import path from "node:path";

const desktop = path.resolve(import.meta.dirname, "..", "apps", "desktop");
const run = (args) => execFileSync(process.execPath, args, { cwd: desktop, stdio: "inherit" });

run([path.resolve(desktop, "..", "..", "node_modules", "vite", "bin", "vite.js"), "build"]);
run([path.join(desktop, "scripts", "bundle-electron-main.mjs"), "--dev"]);
