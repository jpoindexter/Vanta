import { execFileSync, spawnSync } from "node:child_process";
import { signAsync } from "@electron/osx-sign";

const mode = process.argv.includes("--dist") ? "dist" : "dir";
const app = "release/mac-arm64/Vanta.app";

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function developerIdentity() {
  if (process.env.VANTA_DESKTOP_SIGN_IDENTITY) return process.env.VANTA_DESKTOP_SIGN_IDENTITY;
  try {
    const rows = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" });
    return rows.match(/\)\s+([A-F0-9]{40})\s+"Developer ID Application:/)?.[1];
  } catch { return undefined; }
}

run("npx", ["electron-builder", "--mac", "dir", "--arm64"], { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" });
const identity = developerIdentity();
if (identity) {
  console.log(`Signing Vanta.app with Developer ID ${identity.slice(0, 8)}…`);
  await signAsync({ app, identity, identityValidation: true, platform: "darwin", hardenedRuntime: true, gatekeeperAssess: false });
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app]);
} else console.warn("No Developer ID Application certificate found; leaving the local artifact unsigned.");

if (mode === "dist") {
  run("npx", ["electron-builder", "--prepackaged", app, "--mac", "dmg", "zip", "--arm64"], { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" });
}
