import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";
import { chatFirstProviderFixture } from "./lib/chat-first-provider-fixture.mjs";

const root = await mkdtemp(join(tmpdir(), "vanta-instruction-package-"));
const project = join(root, "project");
const proofHome = join(root, "state");
const userData = join(root, "profile");
const artifacts = resolve(".artifacts/instruction-boundary-proof");
const executablePath = resolve(process.env.VANTA_DESKTOP_APP ?? "release/mac-arm64/Vanta.app/Contents/MacOS/Vanta");
const asar = resolve(dirname(executablePath), "../Resources/app.asar");
const packageHash = async () => createHash("sha256").update(await readFile(asar)).digest("hex");
const candidateSha256 = await packageHash();
const content = "# Disposable instruction proof\nNo operator data.\n";
const payloadHash = createHash("sha256").update(content).digest("hex");
const target = join(project, "VANTA.md");
const checks = [];
const rendererErrors = [];
let app;
let page;
await Promise.all([project, proofHome, userData, artifacts].map((path) => mkdir(path, { recursive: true })));
// Fixture-owned rule demonstrates that an Always grant cannot suppress standing-order confirmation.
await writeFile(join(proofHome, "permissions.tsv"), "allow\twrite_file\t\n");
const fixture = await chatFirstProviderFixture();

async function launch() {
  app = await electron.launch({ executablePath, args: ["--project", project, "--no-companion"], cwd: process.cwd(), env: {
    PATH: process.env.PATH ?? "/usr/bin:/bin:/opt/homebrew/bin", TMPDIR: tmpdir(), LANG: "en_US.UTF-8",
    VANTA_HOME: proofHome, VANTA_DESKTOP_USER_DATA: userData, VANTA_DESKTOP_AUTOMATION: "1",
    VANTA_DESKTOP_PORT: "18890", VANTA_PROVIDER: "custom", VANTA_MODEL: "desktop-proof",
    VANTA_OPENAI_BASE_URL: fixture.url, VANTA_MCP_AUTO_MOUNT: "0", VANTA_PROMPT_SUGGESTIONS: "0",
    VANTA_OPERATING_MODE: "default", VANTA_PERMISSION_MODE: "default",
  } });
  page = await app.firstWindow(); page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => rendererErrors.push(error.message));
  await page.locator(".chat-first-shell").waitFor();
  await page.waitForFunction(() => !document.querySelector("#vanta-composer")?.disabled);
}
async function setMode(mode) {
  await page.evaluate(async (mode) => {
    const response = await fetch("/api/access-mode", { method: "POST", headers: {
      "content-type": "application/json", "x-vanta-desktop-boundary": window.vantaDesktop.boundaryToken,
    }, body: JSON.stringify({ mode }) });
    if (!response.ok) throw new Error(`Scope mode: HTTP ${response.status}`);
  }, mode);
}
async function send(prompt) {
  await page.locator("#vanta-composer").fill(prompt);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}
async function settled(prompt) {
  await page.getByText(`Local provider reply: ${prompt}`, { exact: true }).waitFor();
  await page.getByRole("button", { name: "Stop task", exact: true }).waitFor({ state: "hidden" });
}
async function check(name, run) {
  await run(); checks.push({ name, result: "passed" }); console.log(`PASS ${name}`);
}
async function approval() {
  const request = page.locator(".inline-approval");
  await request.waitFor();
  const text = await request.innerText();
  assert(text.includes(target), "preview omits resolved instruction target");
  assert(text.includes(`${Buffer.byteLength(content)} bytes`), "preview omits exact byte count");
  assert(text.includes(payloadHash), "preview omits exact payload hash");
  assert(text.includes("scope") && text.includes(project), "preview omits project scope");
  assert(text.includes("standing instruction"), "preview omits reason");
  return request;
}
try {
  await launch(); await setMode("full");
  await check("full access and stored Always rule still show an exact instruction preview; rejection writes nothing", async () => {
    const prompt = "Instruction boundary proof: denied";
    const before = fixture.requests.length;
    await send(prompt); const request = await approval();
    await page.screenshot({ path: join(artifacts, "01-fresh-preview.png") });
    await request.getByRole("button", { name: "Reject", exact: true }).click();
    await settled(prompt); await assert.rejects(readFile(target, "utf8"));
    assert.equal(fixture.requests.length - before, 2, "denial retried the publication");
  });
  await check("fresh Allow once executes one fixture write and receipts omit complete body", async () => {
    const prompt = "Instruction boundary proof: approved";
    const before = fixture.requests.length;
    await send(prompt); const request = await approval();
    await request.getByRole("button", { name: "Allow once", exact: true }).click();
    await settled(prompt); assert.equal(await readFile(target, "utf8"), content);
    assert.equal(fixture.requests.length - before, 2, "approved write was emitted more than once");
    const receipt = await readFile(join(project, ".vanta/approvals.jsonl"), "utf8");
    assert(!receipt.includes(content.trim()), "approval receipt contains complete instruction body");
  });
  await app.close(); app = undefined; await launch(); await setMode("auto");
  await check("restart and Auto require another fresh approval; rejection preserves earlier approved bytes", async () => {
    await page.locator("button.chat-new").click();
    const prompt = "Instruction boundary proof: after restart";
    await send(prompt); const request = await approval();
    await request.getByRole("button", { name: "Reject", exact: true }).click();
    await settled(prompt); assert.equal(await readFile(target, "utf8"), content);
  });
  await check("ordinary source write remains usable without a standing-order prompt", async () => {
    const prompt = "Instruction ordinary source proof: routine create";
    await send(prompt); await settled(prompt);
    assert.equal(await page.locator(".inline-approval").count(), 0);
    assert.equal(await readFile(join(project, "ordinary-source.ts"), "utf8"), "export const proof = true;\n");
  });
  assert.deepEqual(rendererErrors, []); assert.equal(await packageHash(), candidateSha256);
  const evidence = { verdict: "passed", candidateSha256, checks, providerRequests: fixture.requests.length,
    boundary: "External model fixture; real signed Electron, renderer, HTTP, kernel, approval and file tools; disposable state only", rendererErrors };
  await writeFile(join(artifacts, "result.json"), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence));
} catch (error) {
  await page?.screenshot({ path: join(artifacts, "failure.png") }).catch(() => {});
  if (page && !page.isClosed()) await writeFile(join(artifacts, "failure-ui.txt"), await page.locator("body").innerText());
  await writeFile(join(artifacts, "result.json"), JSON.stringify({ verdict: "failed", candidateSha256, checks, error: String(error) }));
  throw error;
} finally {
  await app?.close().catch(() => {}); await fixture.close();
  await rm(root, { recursive: true, force: true });
}
