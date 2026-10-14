// Provider-setup proof, one run: the real Electron shell + real Vanta server in a sandbox VANTA_HOME, on a
// machine with NO model provider configured. Drives the criterion through the UI:
//   a first run shows the provider picker; an unreachable Ollama is reported; a reachable one connects and chats;
//   Settings > Providers saves a (fake) API key, verified by the server against a stand-in endpoint;
//   the key is then revoked mid-task: the chat shows the reconnect card (not "Task stopped before completion");
//   a new (fake) key resumes the saved request. Keys never reach the page, the log or storage.
//
//   node tools/provider-proof/run.mjs --out docs/proofs/provider-setup/run-01 [--keep]
import fs from "node:fs";
import path from "node:path";

import { killLeftovers, launchApp, makeSandbox } from "../done-path/harness.mjs";
import { newChat, sendText, sleep } from "../done-path/lib.mjs";
import { waitForShell } from "../vanta-app.mjs";
import { startFakeOllama, startKeyedProvider } from "./fake-provider.mjs";
import { scanForSecrets } from "./scan.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = path.resolve(option("--out", path.join(import.meta.dirname, "..", "..", "docs", "proofs", "provider-setup", `run-${Date.now()}`)));
const KEYS = { A: "fake-key-A-not-real-111111", B: "fake-key-B-not-real-222222" };
const ANSWER = "Scripted turn finished.";
const TIMEOUT = 20_000;

const ctx = { box: null, cur: null, provider: null, ollama: null, steps: [], appLog: [] };
const shot = (name) => ctx.cur?.page.screenshot({ path: path.join(outDir, `${name}.png`) }).catch(() => undefined);
const envFile = () => path.join(ctx.box.projectA, ".vanta", ".env");
const readEnv = () => (fs.existsSync(envFile()) ? fs.readFileSync(envFile(), "utf8") : "");
const envKeysOnly = (text) => text.split("\n").filter(Boolean).map((line) => line.split("=")[0]);
const bodyText = () => ctx.cur.page.evaluate(() => document.body.innerText);
const count = async (text) => (await bodyText()).split(text).length - 1;
const api = (apiPath) => ctx.cur.page.evaluate(async (p) => {
  try { return { ok: true, data: await window.hermesDesktop.api({ path: p }) }; } catch (e) { return { ok: false, error: String(e.message ?? e).slice(0, 200) }; }
}, apiPath);

async function waitText(text, { timeout = TIMEOUT, present = true } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if ((await bodyText()).includes(text) === present) return;
    await sleep(200);
  }
  throw new Error(`timed out waiting for text ${present ? "" : "to go: "}${JSON.stringify(text)}`);
}

async function waitFinishedCount(n) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if ((await count(ANSWER)) >= n) return;
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${n} answer(s); saw ${await count(ANSWER)}`);
}

const STEPS = [
  ["a", "first run, no provider: the provider picker is shown and the server has none", async () => {
    await waitText("Let's get you setup with Vanta");
    await waitText("Local / custom endpoint");
    await shot("a-first-run");
    const text = await bodyText();
    for (const name of ["OpenAI", "Local / custom endpoint", "I'll choose a provider later"]) if (!text.includes(name)) throw new Error(`picker lacks ${name}`);
    const status = await api("/api/status");
    if (status.ok) throw new Error(`server unexpectedly has a provider: ${JSON.stringify(status.data).slice(0, 120)}`);
    return { serverStatus: status.error, envFile: fs.existsSync(envFile()) ? "present" : "absent" };
  }],
  ["b", "Ollama not running: the app says so and saves nothing", async () => {
    const { page } = ctx.cur;
    await page.getByRole("button", { name: /Local \/ custom endpoint/ }).click();
    await page.locator("input[type='text']").first().fill("http://localhost:11434");
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await waitText("Ollama is not answering at http://localhost:11434");
    await shot("b-ollama-down");
    if (fs.existsSync(envFile())) throw new Error("an env file was written for an unreachable provider");
    return { message: "Ollama is not answering at http://localhost:11434. Start it, then connect again.", envFile: "absent" };
  }],
  ["c", "Ollama running: connects, the picker closes, a chat is answered", async () => {
    const { page } = ctx.cur;
    ctx.ollama.setUp(true);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    // The confirm card (model) follows a connect; accept whatever default the server chose.
    const begin = page.getByRole("button", { name: /^(Begin|Continue|Start|Done)/i }).first();
    await begin.waitFor({ state: "visible", timeout: TIMEOUT }).then(() => begin.click()).catch(() => undefined);
    await waitText("Let's get you setup with Vanta", { present: false });
    const status = await api("/api/status");
    if (!status.ok || status.data.provider !== "ollama") throw new Error(`status after connect: ${JSON.stringify(status)}`);
    await newChat(ctx.cur.page);
    await sendText(page, "hello from ollama");
    await waitFinishedCount(1);
    await shot("c-ollama-chat");
    // The status bar must stop saying a provider is needed (readiness re-asked after the connect).
    await waitText("Backend needs setup", { present: false, timeout: 15_000 });
    return { provider: status.data.provider, model: status.data.model, envKeys: envKeysOnly(readEnv()) };
  }],
  ["d", "Settings > Providers: a fake API key is saved server-side; the server config reflects it", async () => {
    const { page } = ctx.cur;
    ctx.provider.accept("A");
    await page.evaluate(() => { window.location.hash = "#/settings?tab=providers&pview=keys"; });
    await waitText("Groq (fast inference)", { timeout: 30_000 });
    await shot("d1-providers-page");
    const row = page.locator("[id^='provider-key-']").filter({ hasText: /Groq/ }).first();
    await row.click();
    const input = row.locator("input").first();
    await input.waitFor({ state: "visible", timeout: TIMEOUT });
    await input.fill(KEYS.A);
    await shot("d2-key-typed");
    const saveButton = row.getByRole("button", { name: "Save", exact: true });
    await saveButton.click();
    const deadline = Date.now() + 30_000;
    let status;
    while (Date.now() < deadline) {
      status = await api("/api/status");
      if (status.ok && status.data.provider === "groq") break;
      await sleep(300);
    }
    if (!status?.ok || status.data.provider !== "groq") {
      const page_text = (await bodyText()).split("\n").filter((l) => /could not|rejected|fail|error|saved|GROQ|credential|verify|placeholder|set/i.test(l)).slice(0, 12);
      throw new Error(`status after key save: provider=${status?.data?.provider}; endpoint saw ${JSON.stringify(ctx.provider.log)}; page says ${JSON.stringify(page_text)}`);
    }
    const setup = await api("/api/setup");
    const groq = setup.data.find((o) => o.id === "groq");
    const env = readEnv();
    await shot("d3-saved");
    return {
      status: { provider: status.data.provider, model: status.data.model },
      setupGroq: { keyConfigured: groq.keyConfigured, hasKeyValueField: Object.values(groq).some((v) => v === KEYS.A) },
      envKeys: envKeysOnly(env), envMode: (fs.statSync(envFile()).mode & 0o777).toString(8),
      verifiedAgainstEndpoint: ctx.provider.log.filter((r) => r.probe).map((r) => ({ key: r.key, status: r.status })),
    };
  }],
  ["e", "chat works with the saved key", async () => {
    await ctx.cur.page.keyboard.press("Escape");
    await ctx.cur.page.locator("[data-tour='sidebar-nav-new-session']").waitFor({ state: "visible", timeout: TIMEOUT });
    await newChat(ctx.cur.page);
    await sendText(ctx.cur.page, "first question");
    // The answer appears once per chat: the one from step c is in another chat, so the count is 1 here.
    await waitFinishedCount(1);
    await shot("e-chat");
    return { modelCalls: ctx.provider.log.filter((r) => !r.probe).map((r) => ({ key: r.key, status: r.status, lastUser: r.lastUser })) };
  }],
  ["f", "key revoked mid-task: the reconnect card shows, not the generic stop sentence", async () => {
    const { page } = ctx.cur;
    ctx.provider.revoke("A");
    await ctx.cur.app.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      globalThis.__ppFrames = [];
      const send = contents.send.bind(contents);
      contents.send = (channel, ...a) => { try { const t = JSON.stringify(a); if (t.includes("message.") || t.includes("turn.complete") || t.includes('"error"')) globalThis.__ppFrames.push(t.slice(0, 700)); } catch {} return send(channel, ...a); };
    });
    await sendText(page, "summarize the brief");
    await waitText("Reconnect model", { timeout: 15_000 }).catch(async (e) => { throw new Error(`${e.message}; frames ${JSON.stringify(await ctx.cur.app.evaluate(() => globalThis.__ppFrames))}`); });
    await shot("f-reconnect-card");
    const text = await bodyText();
    if (text.includes("Task stopped before completion")) throw new Error("generic stop sentence shown");
    return { cardShown: true, genericStopSentence: false, statusAfter: (await api("/api/status")).error ?? "ok" };
  }],
  ["g", "a new key resumes the saved request", async () => {
    const { page } = ctx.cur;
    ctx.provider.accept("B");
    const answersBefore = await count(ANSWER);
    await page.getByRole("button", { name: "Reconnect model" }).click();
    const input = page.locator("[data-testid='provider-reconnect'] input[type='password']");
    await input.waitFor({ state: "visible", timeout: TIMEOUT });
    await shot("g1-dialog");
    await input.fill(KEYS.B);
    await page.getByRole("button", { name: "Reconnect and resume" }).click();
    await waitText("Reconnect model", { present: false, timeout: 30_000 });
    await waitFinishedCount(answersBefore + 1);
    await shot("g2-resumed");
    const calls = ctx.provider.log.filter((r) => !r.probe).map((r) => ({ key: r.key, status: r.status, lastUser: r.lastUser }));
    const resumed = calls.at(-1);
    if (!(resumed.key === "B" && resumed.status === 200 && resumed.lastUser === "summarize the brief")) throw new Error(`resumed call: ${JSON.stringify(resumed)}`);
    return { modelCalls: calls };
  }],
  ["h", "no key reached the page, the app log or storage; the only file holding one is the project .env", async () => {
    const { page } = ctx.cur;
    const secrets = Object.values(KEYS);
    const storage = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.body.innerText, [...document.querySelectorAll("input")].filter((i) => i.type !== "password").map((i) => i.value)]));
    const inPage = secrets.filter((k) => storage.includes(k)).length;
    const inLog = secrets.filter((k) => ctx.appLog.join("\n").includes(k)).length;
    const files = scanForSecrets(ctx.box.root, secrets).map((f) => path.relative(ctx.box.root, f));
    const mode = (fs.statSync(envFile()).mode & 0o777).toString(8);
    if (inPage || inLog) throw new Error(`key found in page (${inPage}) or app log (${inLog})`);
    const onlyEnv = files.length === 1 && files[0] === path.join("project", "alpha", ".vanta", ".env");
    if (!onlyEnv) throw new Error(`unexpected files hold a key: ${files.join(", ")}`);
    return { inPageOrStorage: inPage, inAppLog: inLog, filesHoldingAKey: files, envMode: mode };
  }],
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  ctx.box = await makeSandbox();
  ctx.provider = await startKeyedProvider(KEYS);
  ctx.ollama = await startFakeOllama();
  // The app's own `groq` provider, pointed at the stand-in endpoint: the real setup route verifies a key against it.
  fs.writeFileSync(path.join(ctx.box.vantaHome, "providers.json"), JSON.stringify({ providers: { groq: { baseURL: ctx.provider.url, keyEnv: "GROQ_API_KEY", model: "proof-model" } } }));
  let failed = false;
  try {
    ctx.cur = await launchApp({ box: ctx.box, project: ctx.box.projectA, extraEnv: { VANTA_OLLAMA_URL: ctx.ollama.url } });
    for (const stream of [ctx.cur.app.process().stdout, ctx.cur.app.process().stderr]) stream?.on("data", (d) => ctx.appLog.push(String(d)));
    await waitForShell(ctx.cur.page);
    ctx.cur.page.setDefaultTimeout(TIMEOUT);
    for (const [id, title, fn] of STEPS) {
      if (failed) { ctx.steps.push({ id, title, status: "SKIPPED" }); continue; }
      const started = Date.now();
      try {
        ctx.steps.push({ id, title, status: "PASS", ms: Date.now() - started, detail: await fn() });
      } catch (error) {
        failed = true;
        await shot(`FAIL-${id}`);
        ctx.steps.push({ id, title, status: "FAIL", ms: Date.now() - started, error: String(error.message ?? error).split("\n").slice(0, 3).join(" ").slice(0, 500) });
      }
    }
  } finally {
    const errors = ctx.cur?.errors ?? [];
    await ctx.cur?.app.close().catch(() => undefined);
    await ctx.provider.close(); await ctx.ollama.close();
    killLeftovers(ctx.box);
    if (!flag("--keep")) fs.rmSync(ctx.box.root, { recursive: true, force: true });
    const result = { sandbox: flag("--keep") ? ctx.box.root : "(removed)", steps: ctx.steps, consoleErrors: errors.slice(0, 10), pass: ctx.steps.every((s) => s.status === "PASS") };
    fs.writeFileSync(path.join(outDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result));
    process.exit(result.pass ? 0 : 1);
  }
}

await main();
