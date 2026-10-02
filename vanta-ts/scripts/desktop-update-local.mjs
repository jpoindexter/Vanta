import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installLocalDesktop, hasRunningDesktop } from "./lib/desktop-local-install.mjs";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
if (process.platform !== "darwin") throw new Error("This local app updater currently supports macOS only.");
if (process.argv.length > 2) throw new Error("No flags are accepted; this command always rebuilds and verifies before installing.");
const target = "/Applications/Vanta.app";
const candidate = resolve("release/mac-arm64/Vanta.app");

function assertStopped() {
  const processes = execFileSync("ps", ["-axo", "comm="], { encoding: "utf8" });
  if (hasRunningDesktop(processes, target)) {
    throw new Error("Quit Vanta from its menu after saving your work, then run desktop:rebuild again. No app was replaced.");
  }
}

function run(command, args, env = process.env) {
  execFileSync(command, args, { stdio: "inherit", env });
}

function verify(bundle) {
  const id = execFileSync("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleIdentifier", join(bundle, "Contents/Info.plist")], { encoding: "utf8" }).trim();
  if (id !== "studio.theft.vanta") throw new Error("Candidate has the wrong bundle identifier.");
  run("codesign", ["--verify", "--deep", "--strict", bundle]);
  const signature = execFileSync("codesign", ["-d", "-r-", bundle], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (!signature.includes("anchor apple generic")) throw new Error("A Developer ID signed local build is required; ad-hoc signing is not accepted.");
}

assertStopped();
run("npm", ["run", "typecheck"]);
run("npm", ["run", "desktop:renderer:typecheck"]);
run("node", ["--test", "scripts/lib/desktop-local-install.node-test.mjs"]);
run("npm", ["run", "desktop:pack"]);
run("node", ["scripts/desktop-chat-first-proof.mjs"], { ...process.env, VANTA_DESKTOP_APP: join(candidate, "Contents/MacOS/Vanta") });
console.log("Installing the verified app; retaining the previous app and all user data.");
const receipt = await installLocalDesktop({ candidate, target, verify, assertStopped,
  backupRoot: join(homedir(), "Library/Application Support/Vanta Local Updates") });
console.log(JSON.stringify(receipt, null, 2));
console.log("Installed app matches the tested package. Open /Applications/Vanta.app. No release or notarization was performed.");
