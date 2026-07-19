import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const packagedApp = resolve(process.env.VANTA_DESKTOP_APP ?? "release/mac-arm64/Vanta.app/Contents/MacOS/Vanta");
if (!existsSync(packagedApp)) throw new Error(`Packaged Vanta executable not found: ${packagedApp}`);

const scripts = [
  ["shell", "scripts/desktop-shell-convergence-smoke.mjs"],
  ["queue", "scripts/desktop-queued-turn-editor-smoke.mjs"],
];
const targets = [["source", undefined], ["packaged", packagedApp]];
const receipt = { generatedAt: new Date().toISOString(), targets: {} };
let port = Number(process.env.VANTA_DESKTOP_ACCESSIBILITY_PORT ?? 7990);

for (const [target, executable] of targets) {
  receipt.targets[target] = {};
  for (const [name, script] of scripts) {
    const result = spawnSync(process.execPath, [script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        VANTA_DESKTOP_ACCESSIBILITY_PROOF: "1",
        VANTA_DESKTOP_SMOKE_PORT: String(port++),
        ...(executable ? { VANTA_DESKTOP_APP: executable } : {}),
      },
      encoding: "utf8",
      timeout: 180_000,
    });
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    if (result.status !== 0) throw new Error(`${target} ${name} accessibility flow failed with exit ${result.status ?? "unknown"}`);
    receipt.targets[target][name] = parseReceipt(result.stdout, target, name);
  }
}

receipt.ok = true;
process.stdout.write(`${JSON.stringify(receipt)}\n`);

function parseReceipt(output, target, name) {
  for (const line of output.trim().split("\n").reverse()) {
    try {
      const value = JSON.parse(line);
      if (value && typeof value === "object") return value;
    } catch {
      // Runtime logs may precede the final receipt.
    }
  }
  throw new Error(`${target} ${name} flow did not emit a JSON receipt`);
}
