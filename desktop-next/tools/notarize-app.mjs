// Sends a Developer ID signed app to Apple for notarization, waits for the verdict, staples the ticket and checks it.
//   node tools/notarize-app.mjs [--app /path/Vanta.app] [--profile vanta-notary]
// The credentials live in the macOS keychain under a profile name; this script never sees a password. Create it once:
//   xcrun notarytool store-credentials "vanta-notary" --apple-id <your Apple ID> --team-id <TEAM ID>
// (it asks for an app-specific password, made at appleid.apple.com > Sign-In and Security > App-Specific Passwords).
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const next = path.resolve(import.meta.dirname, "..");
const app = path.resolve(option("--app", path.join(next, "apps", "desktop", "release", "mac-arm64", "Vanta.app")));
const profile = option("--profile", process.env.VANTA_NOTARY_PROFILE ?? "vanta-notary");

function hasProfile() {
  const probe = spawnSync("xcrun", ["notarytool", "history", "--keychain-profile", profile, "--output-format", "json"], { encoding: "utf8" });

  return probe.status === 0;
}

if (!fs.existsSync(app)) {
  console.error(`No app at ${app}. Build it first: npm run vanta:package with VANTA_SIGN_IDENTITY set.`);
  process.exit(1);
}

if (!hasProfile()) {
  console.error(`No notary credentials named "${profile}" in the keychain yet. Run this once in Terminal (it asks for an app-specific password):\n\n  xcrun notarytool store-credentials "${profile}" --apple-id <your Apple ID> --team-id <TEAM ID>\n\nThen run this again.`);
  process.exit(2);
}

const zip = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vanta-notarize-")), "Vanta-notarize.zip");
console.log(`[notarize] zipping ${app}`);
execFileSync("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, zip]);
console.log("[notarize] submitting to Apple and waiting for the verdict (usually 2 to 15 minutes)");
const submit = spawnSync("xcrun", ["notarytool", "submit", zip, "--keychain-profile", profile, "--wait", "--output-format", "json"], { encoding: "utf8" });
fs.rmSync(path.dirname(zip), { recursive: true, force: true });
let verdict = {};
try { verdict = JSON.parse(submit.stdout); } catch { /* handled below */ }
console.log(JSON.stringify(verdict, null, 2));

if (verdict.status !== "Accepted") {
  if (verdict.id) console.error(`Rejected or unfinished. The reasons: xcrun notarytool log ${verdict.id} --keychain-profile ${profile}`);
  else console.error(submit.stderr || "Apple did not answer with a verdict.");
  process.exit(3);
}

execFileSync("xcrun", ["stapler", "staple", app], { stdio: "inherit" });
execFileSync("xcrun", ["stapler", "validate", app], { stdio: "inherit" });
const assess = spawnSync("spctl", ["--assess", "--type", "execute", "--verbose=2", app], { encoding: "utf8" });
console.log(assess.stderr || assess.stdout);
process.exit(assess.status === 0 ? 0 : 4);
