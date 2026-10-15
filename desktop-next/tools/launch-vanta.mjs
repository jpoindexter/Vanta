// Opens the assembled Vanta desktop for a person: the Electron shell with the real Vanta server,
// in a sandbox (own VANTA_HOME, HOME, userData and a throwaway project; a local canned model answers
// chats). Builds first when dist is missing. Closing the window ends the run and removes the sandbox.
//
//   node tools/launch-vanta.mjs [--hidden] [--rebuild]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { desktopRoot, launchVanta } from "./vanta-app.mjs";

const args = process.argv.slice(2);
const dist = path.join(desktopRoot, "dist", "electron-main.mjs");

if (args.includes("--rebuild") || !fs.existsSync(dist)) {
  execFileSync(process.execPath, [path.join(import.meta.dirname, "build-vanta.mjs")], { stdio: "inherit" });
}

const app = await launchVanta({ hidden: args.includes("--hidden") });
console.log(`Vanta is open. Sandbox: ${app.root}\nProject: ${app.project}\nClose the window (or press Ctrl+C) to stop.`);
const stop = async () => {
  await app.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await new Promise((resolve) => app.app.on("close", resolve));
await app.close();
