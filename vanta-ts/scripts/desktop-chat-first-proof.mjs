import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { _electron as electron } from "playwright-core";
import { chatFirstProviderFixture } from "./lib/chat-first-provider-fixture.mjs";
import { scanAccessibility } from "./lib/desktop-accessibility-proof.mjs";
import { workbenchInteractionProof } from "./lib/chat-first-workbench-proof.mjs";
import { retainedCapabilityProof } from "./lib/chat-first-retained-proof.mjs";
import { chatPreviewProof } from "./lib/chat-first-preview-proof.mjs";
import { chatFirstEntryProof, openChatUtility } from "./lib/chat-first-entry-proof.mjs";
import { documentWorkbenchProof } from "./lib/chat-document-workbench-proof.mjs";
import { documentLinksProof } from "./lib/chat-document-links-proof.mjs";
import { desktopSurfaceProof } from "./lib/desktop-surface-proof.mjs";
import { libreChatShellProof } from "./lib/librechat-shell-proof.mjs";

const root = await mkdtemp(join(tmpdir(), "vanta-chat-first-proof-"));
const project = join(root, "project");
const proofHome = join(root, "state");
const userData = join(root, "profile");
const artifacts = resolve(".artifacts/chat-first-proof");
const executablePath = resolve(process.env.VANTA_DESKTOP_APP ?? "release/mac-arm64/Vanta.app/Contents/MacOS/Vanta");
const candidateAsar = resolve(dirname(executablePath), "../Resources/app.asar");
const candidateHash = async () => createHash("sha256").update(await readFile(candidateAsar)).digest("hex");
const candidateSha256 = await candidateHash();
await Promise.all([project, proofHome, userData, artifacts].map((path) => mkdir(path, { recursive: true })));
await writeFile(join(project, "brief.md"), "# Local desktop proof\nNo operator data.\n");
const fixture = await chatFirstProviderFixture();
const checks = [];
const errors = [];
const rendererErrors = [];
let app;
let page;

async function launch() {
  app = await electron.launch({
    executablePath, args: ["--project", project, "--no-companion"], cwd: process.cwd(),
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin:/opt/homebrew/bin", TMPDIR: tmpdir(), LANG: "en_US.UTF-8",
      VANTA_HOME: proofHome, VANTA_DESKTOP_USER_DATA: userData, VANTA_DESKTOP_AUTOMATION: "1",
      VANTA_DESKTOP_PORT: "18790", VANTA_PROVIDER: "custom", VANTA_MODEL: "desktop-proof",
      VANTA_OPENAI_BASE_URL: fixture.url, VANTA_MCP_AUTO_MOUNT: "0", VANTA_PROMPT_SUGGESTIONS: "0",
      VANTA_OPERATING_MODE: "default", VANTA_PERMISSION_MODE: "default",
    },
  });
  app.process().stderr.on("data", (chunk) => {
    const line = chunk.toString();
    if (/Error|exited|fatal/i.test(line)) errors.push(line.slice(0, 1000));
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (error) => rendererErrors.push(error.message));
  await page.locator(".chat-first-shell").waitFor();
  await page.waitForFunction(() => !document.querySelector("#vanta-composer")?.disabled);
}

async function check(name, operation) {
  await operation(); checks.push({ name, result: "passed" }); console.log(`PASS ${name}`);
}
async function capture(name) { await page.screenshot({ path: join(artifacts, `${name}.png`) }); }
async function send(text) {
  await page.locator("#vanta-composer").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}
async function reply(text) { await page.getByText(`Local provider reply: ${text}`, { exact: true }).waitFor(); }
async function idle() { await page.getByRole("button", { name: "Stop task", exact: true }).waitFor({ state: "hidden" }); }
async function api(path) {
  return page.evaluate(async (path) => {
    const result = await fetch(path, { headers: { "x-vanta-desktop-boundary": window.vantaDesktop.boundaryToken } });
    if (!result.ok) throw new Error(`${path}: HTTP ${result.status}`);
    return result.json();
  }, path);
}

try {
  await launch();
  await check("new profile starts white and grey; theme choice persists across reload", async () => {
    assert.equal(await page.locator(".chat-first-shell").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(255, 255, 255)");
    await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
    await page.reload();
    await page.locator(".chat-first-shell.theme-dark").waitFor();
    await page.getByRole("button", { name: "Switch to light mode", exact: true }).click();
    await page.reload();
    await page.locator(".chat-first-shell.theme-light").waitFor();
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(255, 255, 255)");
    await page.waitForFunction(() => !document.querySelector("#vanta-composer")?.disabled);
  });
  await check("packaged app uses disposable project and live local kernel", async () => {
    const status = await api("/api/status");
    assert.equal(status.root, project); assert.equal(status.kernel, "online");
    assert.equal(status.provider, "custom");
  });
  await check("New chat opens composer without task setup", async () => {
    const before = fixture.requests.length;
    await page.locator("button.chat-new").click();
    await page.getByRole("heading", { name: "What’s on your mind?" }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "vanta-composer");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.locator("#vanta-composer").inputValue(), "");
    for (const label of ["Work contract", "Execution host", "Base branch", "Use isolated worktree"]) {
      assert.equal(await page.getByText(label, { exact: true }).count(), 0);
    }
    assert.equal(fixture.requests.length, before);
    await capture("01-new-chat");
  });
  await chatFirstEntryProof({ page, check, fixture, capture });
  await libreChatShellProof({ page, app, check, fixture, capture, candidateAsar });
  await check("send and completed response persist", async () => {
    await send("Remember this local conversation."); await reply("Remember this local conversation."); await idle();
    assert.equal(fixture.requests.length, 1); await capture("02-conversation");
  });
  await check("visible queue supports edit and removal while streaming", async () => {
    await send("Keep this response open");
    await page.getByText("Response streaming. Waiting for your next instruction.", { exact: true }).waitFor();
    await page.locator("#vanta-composer").fill("A visible queued message");
    await page.getByRole("button", { name: "Queue next", exact: true }).click();
    const queue = page.getByRole("region", { name: "Queued messages" });
    await queue.getByText("A visible queued message", { exact: true }).waitFor();
    await queue.getByRole("button", { name: "Edit queued message" }).click();
    await queue.getByLabel("Edit queued message").fill("An edited queued message");
    await queue.getByRole("button", { name: "Save", exact: true }).click();
    await queue.getByText("An edited queued message", { exact: true }).waitFor();
    await capture("03-visible-queue");
    await queue.getByRole("button", { name: "Remove queued message" }).click();
    await queue.waitFor({ state: "hidden" });
    assert.equal(fixture.requests.length, 2);
  });
  await desktopSurfaceProof({ page, app, api, fixture, check, capture });
  await check("stop retains conversation and restores input", async () => {
    await page.getByRole("button", { name: "Stop task", exact: true }).click(); await idle();
    await page.locator("#vanta-composer").fill("Draft belongs to the first chat");
  });
  await check("chat switching restores distinct history, drafts and activity", async () => {
    const row = page.locator(".chat-nav-row").filter({ has: page.locator('[aria-current="page"]') });
    const firstTitle = await row.locator(".chat-nav-open").innerText();
    await page.locator("button.chat-new").click();
    await page.waitForFunction(() => document.querySelector("#vanta-composer")?.value === "");
    assert.equal(await page.locator("#vanta-composer").inputValue(), "");
    await send("This is a second conversation."); await reply("This is a second conversation."); await idle();
    const secondTitle = await row.locator(".chat-nav-open").innerText();
    await page.locator(".chat-nav-open").filter({ hasText: firstTitle }).first().click();
    await reply("Remember this local conversation.");
    assert.equal(await page.locator("#vanta-composer").inputValue(), "Draft belongs to the first chat");
    assert.equal(await page.getByText("Local provider reply: This is a second conversation.", { exact: true }).count(), 0);
    const activity = page.getByRole("region", { name: "Current run activity", exact: true });
    await activity.getByText("Stopped by operator.", { exact: true }).first().waitFor();
    await page.locator(".chat-nav-open").filter({ hasText: secondTitle }).first().click();
    await reply("This is a second conversation.");
    assert.equal(await activity.getByText("Stopped by operator.", { exact: true }).count(), 0);
    await page.locator(".chat-nav-open").filter({ hasText: firstTitle }).first().click();
    await reply("Remember this local conversation.");
    assert.equal(await page.locator("#vanta-composer").inputValue(), "Draft belongs to the first chat");
  });
  await check("queued turn executes once and both turns enter canonical history", async () => {
    await send("Keep this response open");
    await page.getByRole("button", { name: "Stop task", exact: true }).waitFor();
    await page.locator("#vanta-composer").fill("The queued follow-up completed.");
    await page.getByRole("button", { name: "Queue next", exact: true }).click();
    await page.getByRole("region", { name: "Queued messages" }).getByText("The queued follow-up completed.", { exact: true }).waitFor();
    fixture.release(); await reply("The queued follow-up completed."); await idle();
    await page.getByRole("region", { name: "Queued messages" }).waitFor({ state: "hidden" });
    await page.waitForFunction(() => [...document.querySelectorAll(".message.user")].some((node) => node.textContent.includes("The queued follow-up completed.")));
    assert.equal(fixture.requests.filter((request) => request.prompt === "The queued follow-up completed.").length, 1);
    await page.locator("#vanta-composer").fill("Draft belongs to the first chat");
  });
  await check("compact model picker is available", async () => {
    await page.getByRole("button", { name: /Agent model:.*Change model/ }).click();
    await page.getByRole("dialog").waitFor(); await capture("04-model-settings");
    for (let index = 0; index < 12; index++) {
      await page.keyboard.press("Tab");
      assert(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), "dialog lost keyboard focus");
    }
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  });
  await check("keyboard focus, contrast and main landmarks", async () => {
    await scanAccessibility(page, "Chat-first conversation");
    await page.getByRole("button", { name: "Toggle context", exact: true }).click();
    await scanAccessibility(page, "Context panel"); await capture("05-context");
    await page.keyboard.press("Escape");
  });
  await documentWorkbenchProof({ page, check, fixture, capture });
  await documentLinksProof({ page, check, project, send, idle, api, capture });
  await chatPreviewProof({ check, getPage: () => page, getApp: () => app, capture });
  await check("hover and keyboard sidebar actions retain renamed and pinned chat", async () => {
    const active = page.locator('.chat-nav-row[data-active="true"]');
    await active.getByRole("button", { name: /^Actions for/ }).focus();
    await active.getByRole("tooltip").waitFor(); await capture("06-hover-preview");
    await active.getByRole("button", { name: /^Actions for/ }).click();
    await active.getByRole("button", { name: "Rename", exact: true }).click();
    await active.getByLabel("Chat name").fill("Desktop continuity proof");
    await active.getByRole("button", { name: "Save name", exact: true }).click();
    await page.locator(".chat-header-title").getByText("Desktop continuity proof", { exact: true }).waitFor();
    await active.getByRole("button", { name: /^Actions for/ }).click();
    await active.getByRole("button", { name: "Pin chat", exact: true }).click();
    await page.getByRole("region", { name: "Pinned", exact: true }).getByText("Desktop continuity proof", { exact: true }).first().waitFor();
  });
  await check("desktop widths retain composer, navigation and no horizontal overflow", async () => {
    const window = await app.browserWindow(page);
    for (const width of [1024, 760, 1440]) {
      await window.evaluate((win, width) => win.setContentSize(width, 900), width);
      if (width === 760) await page.getByRole("button", { name: "Hide sidebar", exact: true }).click();
      await page.locator("#vanta-composer").waitFor({ state: "visible" });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `horizontal overflow at ${width}`);
      await scanAccessibility(page, `Chat at ${width}px`); await capture(`width-${width}`);
    }
    await page.getByRole("button", { name: "Show sidebar", exact: true }).click();
  });
  await app.close(); app = undefined;
  await check("packaged restart restores saved conversation", async () => {
    await launch();
    const first = page.locator(".chat-nav-open").filter({ hasText: "Desktop continuity proof" });
    await first.first().click(); await reply("Remember this local conversation.");
    assert.equal(await page.locator("#vanta-composer").inputValue(), "Draft belongs to the first chat");
  });
  await check("preserved workspaces open", async () => {
    for (const name of ["Today", "Outputs", "Schedules", "Skills & tools", "Connections"]) {
      await openChatUtility(page, name);
      await page.waitForTimeout(300);
      assert(await page.locator("main").innerText(), `${name} is empty`);
    }
  });
  await check("theme settings preserve legible light controls", async () => {
    await page.locator(".chat-sidebar").getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Appearance", exact: true }).click();
    await page.getByRole("button", { name: "Light", exact: true }).click();
    await scanAccessibility(page, "Light settings"); await capture("07-light-settings");
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await page.keyboard.press("Escape");
  });
  await check("search, archive and restore use canonical chat records", async () => {
    await page.getByRole("searchbox", { name: "Search chats" }).fill("Desktop continuity proof");
    assert.equal(await page.locator(".chat-nav-open").count(), 1);
    await page.locator(".chat-nav-open").click();
    await page.getByRole("button", { name: "Actions for Desktop continuity proof", exact: true }).click();
    await page.getByRole("button", { name: "Archive chat", exact: true }).click();
    await page.locator(".chat-nav-open").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Show archived chats", exact: true }).click();
    await page.getByRole("button", { name: "Actions for Desktop continuity proof", exact: true }).click();
    await page.getByRole("button", { name: "Restore chat", exact: true }).click();
    await page.locator(".chat-nav-open").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Show recent chats", exact: true }).click();
    await page.locator(".chat-nav-open").click(); await reply("Remember this local conversation.");
    await page.getByRole("searchbox", { name: "Search chats" }).fill("");
  });
  await check("project task creation stages context without running a model", async () => {
    const before = fixture.requests.length;
    await openChatUtility(page, "New project task");
    await page.getByRole("dialog", { name: "New project task", exact: true }).waitFor();
    await page.getByLabel("First instruction", { exact: true }).fill("Prepare a project task without executing it.");
    await capture("08-project-task");
    await page.getByRole("button", { name: "Create draft", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.match(await page.locator("#vanta-composer").inputValue(), /Prepare a project task without executing it\./);
    assert.match(await page.locator("#vanta-composer").inputValue(), /Use an isolated worktree\./);
    assert.equal(fixture.requests.length, before);
  });
  await retainedCapabilityProof({ check, getPage: () => page, getApp: () => app, fixture, project, api, send, idle, capture });
  await workbenchInteractionProof({ check, getPage: () => page, getApp: () => app, fixture, project, proofHome, api, send, idle, capture,
    restart: async () => { await app.close(); app = undefined; await launch(); } });
  await check("Classic shell remains reachable", async () => {
    await page.getByRole("link", { name: "Classic view" }).click();
    await page.locator(".desktop-nav").waitFor();
    assert.equal(await page.locator(".chat-first-shell").count(), 0);
  });
  assert.deepEqual(rendererErrors, [], "renderer emitted uncaught errors");
  assert.equal(await candidateHash(), candidateSha256, "the candidate changed during packaged verification");
  console.log(JSON.stringify({ verdict: "passed", candidateSha256, checks, providerRequests: fixture.requests.length, artifacts, isolatedState: root, rendererErrors, hostDiagnostics: errors }, null, 2));
  await writeFile(join(artifacts, "result.json"), JSON.stringify({ verdict: "passed", candidateSha256, checks, providerRequests: fixture.requests.length, rendererErrors, hostDiagnostics: errors }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) {
    await capture("failure").catch(() => {});
    await writeFile(join(artifacts, "failure-ui.txt"), await page.locator("body").innerText());
  }
  await writeFile(join(artifacts, "result.json"), JSON.stringify({ verdict: "failed", candidateSha256, checks, error: String(error), errors }, null, 2));
  throw error;
} finally {
  await app?.close().catch(() => {}); await fixture.close();
}
