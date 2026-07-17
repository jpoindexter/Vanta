import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const packagedApp = resolve(process.env.VANTA_DESKTOP_APP ?? "release/mac-arm64/Vanta.app/Contents/MacOS/Vanta");
const sourceOnly = process.argv.includes("--source-only");
const flows = [
  ["shell", "scripts/desktop-shell-convergence-smoke.mjs"],
  ["work-recovery", "scripts/desktop-run-recovery-smoke.mjs"],
  ["schema-trace", "scripts/desktop-schema-trace-smoke.mjs"],
  ["long-session", "scripts/desktop-long-session-navigation-smoke.mjs"],
  ["queued-turns", "scripts/desktop-queued-turn-editor-smoke.mjs"],
  ["runtime-profiles", "scripts/desktop-runtime-strip-smoke.mjs"],
  ["attachments", "scripts/desktop-context-attachments-smoke.mjs"],
  ["sessions", "scripts/desktop-session-management-smoke.mjs"],
  ["outputs-connect", "scripts/desktop-operator-flows-smoke.mjs"],
];
const targets = sourceOnly ? [["source", undefined]] : [["source", undefined], ["packaged", packagedApp]];
const receipt = { generatedAt: new Date().toISOString(), viewports: ["1440x960", "1024x640", "760x700"], targets: {} };

if (!sourceOnly && !existsSync(packagedApp)) throw new Error(`Packaged Vanta executable not found: ${packagedApp}`);

let port = Number(process.env.VANTA_DESKTOP_FLOW_PORT ?? 7940);
for (const [target, executable] of targets) {
  receipt.targets[target] = {};
  for (const [name, script] of flows) {
    const env = {
      ...process.env,
      VANTA_DESKTOP_SMOKE_PORT: String(port++),
      ...(executable ? { VANTA_DESKTOP_APP: executable } : {}),
    };
    const result = spawnSync(process.execPath, [script], { cwd: process.cwd(), env, encoding: "utf8", timeout: 180_000 });
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    if (result.status !== 0) throw new Error(`${target} ${name} flow failed with exit ${result.status ?? "unknown"}`);
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
      // Runtime logs may precede the flow's final JSON receipt.
    }
  }
  throw new Error(`${target} ${name} flow did not emit a JSON receipt`);
}
