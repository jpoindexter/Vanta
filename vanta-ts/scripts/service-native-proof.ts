import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createServiceManager } from "../src/service/manager.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fixture = await mkdtemp(join(tmpdir(), "vanta-service-proof-"));
const stateHome = join(fixture, "state");
await mkdir(stateHome, { recursive: true });

if (process.platform === "win32") {
  await writeFile(join(fixture, "run.ps1"), [
    '"SERVICE_PROOF_STARTED" | Out-File -Append $env:VANTA_SERVICE_LOG',
    "while ($true) { Start-Sleep -Seconds 1 }",
    "",
  ].join("\r\n"));
} else {
  const script = join(fixture, "run.sh");
  await writeFile(script, '#!/bin/sh\necho SERVICE_PROOF_STARTED\nexec /usr/bin/env -u RUNNER_TRACKING_ID /bin/sleep 600\n');
  await chmod(script, 0o700);
}

process.env.VANTA_HOME = stateHome;
const manager = createServiceManager({ home: homedir(), vantaHome: stateHome });
const receipt: Record<string, unknown> = { platform: process.platform, startedAt: new Date().toISOString() };

async function waitRunning(expected: boolean): Promise<Awaited<ReturnType<typeof manager.status>>> {
  let status = await manager.status();
  for (let i = 0; i < 20 && status.running !== expected; i += 1) {
    await sleep(500);
    status = await manager.status();
  }
  if (status.running !== expected) throw new Error(`service running=${status.running}; expected ${expected}: ${status.detail ?? ""}`);
  return status;
}

async function waitForLog(marker: string): Promise<boolean> {
  for (let i = 0; i < 20; i += 1) {
    if ((await manager.logs(50)).includes(marker)) return true;
    await sleep(500);
  }
  return false;
}

try {
  const before = await manager.status();
  if (before.installed || (before.artifactPath && existsSync(before.artifactPath))) {
    throw new Error(`refusing to replace existing service artifact: ${before.artifactPath}`);
  }
  receipt.artifactPath = await manager.install(fixture);
  receipt.started = await waitRunning(true);
  await manager.restart();
  receipt.restarted = await waitRunning(true);
  if (process.platform !== "win32" && !(await waitForLog("SERVICE_PROOF_STARTED"))) {
    throw new Error("service output did not reach the configured log");
  }
  await manager.stop();
  if (!(await waitForLog("SERVICE_PROOF_STARTED"))) throw new Error("service output did not reach the configured log");
  receipt.logCaptured = true;
  const stopped = await waitRunning(false);
  if (!stopped.stale) throw new Error("stopped installed service was not reported stale");
  receipt.stopped = stopped;
  await manager.uninstall();
  const removed = await manager.status();
  if (removed.installed) throw new Error("service artifact remains installed after uninstall");
  receipt.removed = removed;
  receipt.ok = true;
} finally {
  await manager.uninstall().catch(() => undefined);
  receipt.finishedAt = new Date().toISOString();
  await mkdir(join(process.cwd(), ".artifacts"), { recursive: true });
  const out = join(process.cwd(), ".artifacts", `service-proof-${process.platform}.json`);
  await writeFile(out, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(await readFile(out, "utf8"));
}
