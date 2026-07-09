import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";
import { startCompanionPairing } from "../src/companion/auth.ts";
import { createDesktopServer } from "../src/desktop/server.ts";

const repoRoot = resolve(process.cwd(), "..");
const home = await mkdtemp(join(tmpdir(), "vanta-companion-smoke-"));
process.loadEnvFile(join(repoRoot, "vanta-ts", ".env"));
process.env.VANTA_HOME = home;
const proof = join(repoRoot, "companion-proof.txt");
const backup = `${proof}.smoke-backup`;
let hadProof = false;
let app;
const server = createDesktopServer(repoRoot, { enabled: true, home, port: 0, isLoopback: () => false });

try {
  try { await copyFile(proof, backup); hadProof = true; } catch { hadProof = false; }
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const port = server.address().port;
  const pairing = await startCompanionPairing(home);
  app = await electron.launch({ args: ["desktop-app/electron/companion-smoke.mjs"], cwd: process.cwd(), env: { ...process.env, VANTA_COMPANION_SMOKE_URL: `http://127.0.0.1:${port}/companion?remote=1`, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" } });
  const page = await app.firstWindow(); page.setDefaultTimeout(20_000);
  await page.getByRole("heading", { name: "Pair this device" }).waitFor();
  await page.getByLabel("Device name").fill("Smoke phone");
  await page.getByLabel("Pairing code").fill(pairing.code);
  await page.getByRole("button", { name: "Pair" }).click();
  await page.getByRole("heading", { name: "Online" }).waitFor();
  const terminalStatus = await page.evaluate(() => fetch("/api/terminal").then((response) => response.status));
  assert(terminalStatus === 403, `remote terminal returned ${terminalStatus}`);

  await page.getByLabel("Ask Vanta").fill("Use review_artifact to write companion-proof.txt with exactly COMPANION_APPROVED. Do not use any other tool. Then reply briefly.");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("Approval needed").waitFor();
  await page.getByRole("button", { name: "Allow once" }).click();
  await waitFor(async () => (await readFile(proof, "utf8").catch(() => "")).trim() === "COMPANION_APPROVED");
  await page.locator(".companion-message.assistant").waitFor();
  if (process.env.VANTA_DESKTOP_SMOKE_SCREENSHOT) await page.screenshot({ path: process.env.VANTA_DESKTOP_SMOKE_SCREENSHOT });
  console.log(JSON.stringify({ paired: true, online: true, desktopApiBlocked: true, approvalVisible: true, approvedWriteExecuted: true }));
} finally {
  await app?.close().catch(() => undefined);
  server.closeAllConnections();
  await new Promise((resolveClose) => server.close(() => resolveClose()));
  await rm(home, { recursive: true, force: true });
  if (hadProof) { await copyFile(backup, proof); await rm(backup, { force: true }); }
  else { await rm(proof, { force: true }); await rm(backup, { force: true }); }
}
process.exit(0);

function assert(condition, message) { if (!condition) throw new Error(message); }
async function waitFor(check, timeoutMs = 20_000) { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline) { if (await check()) return; await new Promise((resolveWait) => setTimeout(resolveWait, 100)); } throw new Error("proof write timed out"); }
