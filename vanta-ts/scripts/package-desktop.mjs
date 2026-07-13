import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const mode = process.argv.includes("--dist") ? "dist" : "dir";
const notarize = process.argv.includes("--notarize");
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const app = "release/mac-arm64/Vanta.app";
const dmg = `release/Vanta-${version}-arm64.dmg`;
const entitlements = "desktop-app/build/entitlements.mac.plist";

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function clearSigningState(target) {
  // Finder provenance and a stale .cstemp file make codesign leave Electron's
  // top-level bundle ad hoc-signed. Both are generated packaging state.
  run("xattr", ["-cr", target]);
  run("find", [target, "-name", "*.cstemp", "-delete"]);
}

function signApp(target, identity) {
  clearSigningState(target);
  const candidates = execFileSync(
    "find",
    [
      `${target}/Contents`, "-type", "f", "(", "-perm", "-111", "-o", "-name", "*.dylib", "-o", "-name", "*.node", ")", "-print",
    ],
    { encoding: "utf8" },
  ).trim().split("\n").filter(Boolean);
  for (const candidate of candidates) {
    const kind = execFileSync("file", ["-b", candidate], { encoding: "utf8" });
    if (!kind.includes("Mach-O")) continue;
    run("codesign", ["--force", "--options", "runtime", "--timestamp", "--sign", identity, candidate]);
  }
  const frameworks = execFileSync(
    "find",
    [
      `${target}/Contents/Frameworks`, "-depth", "-type", "d", "(", "-name", "*.app", "-o", "-name", "*.framework", ")", "-print",
    ],
    { encoding: "utf8" },
  ).trim().split("\n").filter(Boolean);
  for (const framework of frameworks) {
    const args = ["--force", "--options", "runtime", "--timestamp", "--sign", identity];
    if (framework.endsWith(".app")) args.push("--entitlements", entitlements);
    run("codesign", [...args, framework]);
  }
  // Enclosed code can leave transient .cstemp files. Remove those before sealing
  // the outer bundle, otherwise macOS will reject a bundle that `--deep` appears to verify.
  clearSigningState(target);
  run("codesign", ["--force", "--options", "runtime", "--timestamp", "--sign", identity, "--entitlements", entitlements, target]);
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", target]);
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
  signApp(app, identity);
} else console.warn("No Developer ID Application certificate found; leaving the local artifact unsigned.");

if (mode === "dist") {
  run("npx", ["electron-builder", "--prepackaged", app, "--mac", "dmg", "zip", "--arm64"], { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" });
  if (identity) {
    console.log(`Signing ${dmg} with Developer ID ${identity.slice(0, 8)}…`);
    run("codesign", ["--force", "--sign", identity, "--timestamp", dmg]);
    run("codesign", ["--verify", "--verbose=4", dmg]);
  }
  if (notarize) {
    if (!identity) throw new Error("A Developer ID Application certificate is required to notarize the DMG.");
    const profile = process.env.VANTA_DESKTOP_NOTARY_PROFILE ?? "vanta";
    run("xcrun", ["notarytool", "submit", dmg, "--keychain-profile", profile, "--wait"]);
    run("xcrun", ["stapler", "staple", dmg]);
    run("xcrun", ["stapler", "validate", dmg]);
    run("spctl", ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=4", dmg]);
  }
  const checksum = execFileSync("shasum", ["-a", "256", basename(dmg)], { cwd: "release", encoding: "utf8" });
  writeFileSync(`${dmg}.sha256`, checksum);
  console.log(`Wrote ${dmg}.sha256`);
}
