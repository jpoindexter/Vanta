import assert from "node:assert/strict";
import { openChatUtility } from "./chat-first-entry-proof.mjs";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scanAccessibility } from "./desktop-accessibility-proof.mjs";
import { permissionPersistenceProof } from "./chat-first-permission-proof.mjs";
import { compactToolActivityProof } from "./librechat-shell-proof.mjs";

export async function workbenchInteractionProof(ctx) {
  await draftProof(ctx);
  await contextProof(ctx);
  await contextKeyboardProof(ctx);
  await libraryProof(ctx);
  await busyNavigationProof(ctx);
  await approvalProof(ctx);
  await compactToolActivityProof(ctx);
  await permissionPersistenceProof(ctx);
  await workspaceProof(ctx);
  await nativeProjectProof(ctx);
}

async function nativeProjectProof(ctx) {
  const native = process.env.VANTA_NATIVE_PICKER_PROOF === "1";
  const mode = native ? "native macOS folder selection" : "simulated OS selection through the real folder-picker IPC";
  await ctx.check(`${mode} carries a project draft through host restart without execution`, async () => {
    const page = ctx.getPage(); const before = ctx.fixture.requests.length;
    let target = join(ctx.project, "..", "second-project");
    await mkdir(target, { recursive: true }); await writeFile(join(target, "README.md"), "# Second disposable project\n");
    target = await realpath(target);
    if (!native) await ctx.getApp().evaluate(({ dialog }, target) => {
      globalThis.vantaProofOriginalDialog = dialog.showOpenDialog;
      dialog.showOpenDialog = async (_parent, options) => {
        if (!options.properties.includes("openDirectory") || options.properties.includes("openFile")) throw new Error("Project picker must select directories only.");
        return { canceled: false, filePaths: [target] };
      };
    }, target);
    await openChatUtility(page, "New project task");
    await page.getByLabel("First instruction", { exact: true }).fill("Retain this instruction in the selected second project.");
    await page.getByRole("button", { name: "Choose project folder", exact: true }).click();
    if (native) console.log(`NATIVE_PICKER_READY ${target}`);
    await page.waitForFunction((target) => document.querySelector("#chat-project-folder")?.value === target, target, { timeout: 180_000 });
    await ctx.capture("16-native-folder-selection");
    await page.getByRole("button", { name: "Create draft", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#vanta-composer")?.value.includes("Retain this instruction in the selected second project."), null, { timeout: 60_000 });
    const status = await ctx.api("/api/status");
    assert.equal(status.root, target); assert.equal(ctx.fixture.requests.length, before);
    assert.equal(await page.evaluate(() => window.vantaDesktop.readPendingProjectTask()), null);
    await ctx.capture("17-project-handoff");
    if (!native) await ctx.getApp().evaluate(({ dialog }) => { dialog.showOpenDialog = globalThis.vantaProofOriginalDialog; delete globalThis.vantaProofOriginalDialog; });
  });
}

async function command(page, query) {
  await page.keyboard.press("Meta+k");
  await page.getByRole("combobox", { name: "Search commands" }).fill(query);
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "Commands", exact: true }).waitFor({ state: "hidden" });
}

async function draftProof(ctx) {
  await ctx.check("never-sent draft survives packaged restart and auto-resumes without a model call", async () => {
    const page = ctx.getPage(); const before = ctx.fixture.requests.length;
    await page.locator("button.chat-new").click();
    await page.locator("#vanta-composer").fill("Never sent: keep this draft after restart.");
    await page.waitForFunction(() => document.querySelector(".chat-composer-hint")?.textContent.includes("Draft saved"));
    const active = page.locator('.chat-nav-row[data-active="true"]');
    await active.getByRole("button", { name: /^Actions for/ }).click();
    await active.getByRole("button", { name: "Rename", exact: true }).click();
    await active.getByLabel("Chat name").fill("Never-sent draft proof");
    await active.getByRole("button", { name: "Save name", exact: true }).click();
    await page.locator(".chat-header-title").getByText("Never-sent draft proof", { exact: true }).waitFor();
    await ctx.restart();
    await ctx.getPage().waitForFunction(() => document.querySelector("#vanta-composer")?.value === "Never sent: keep this draft after restart.");
    const records = await ctx.api("/api/sessions");
    const sessions = Array.isArray(records) ? records : records.sessions;
    assert.equal(sessions.find((row) => row.title === "Never-sent draft proof")?.turns, 0);
    assert.equal(ctx.fixture.requests.length, before);
    await ctx.capture("09-draft-reentry");
  });
  await ctx.check("failed draft save is visible, blocks navigation and recovers on explicit retry", async () => {
    const page = ctx.getPage();
    await page.route("**/api/sessions/draft", (route) => route.request().postDataJSON()?.action === "save" ? route.abort("failed") : route.continue());
    await page.locator("#vanta-composer").fill("Retain me through a failed save.");
    await page.getByRole("button", { name: "Retry draft save", exact: true }).waitFor();
    await page.locator("button.chat-new").click();
    assert.equal(await page.locator("#vanta-composer").inputValue(), "Retain me through a failed save.");
    await page.unroute("**/api/sessions/draft");
    await page.getByRole("button", { name: "Retry draft save", exact: true }).click();
    await page.getByRole("button", { name: "Retry draft save", exact: true }).waitFor({ state: "hidden" });
    await page.locator("button.chat-new").click();
    await page.waitForFunction(() => document.querySelector("#vanta-composer")?.value === "");
  });
}

async function contextProof(ctx) {
  await ctx.check("sidebar and context resize, preserve selected view, and return keyboard focus", async () => {
    const page = ctx.getPage(); const window = await ctx.getApp().browserWindow(page);
    await window.evaluate((win) => win.setContentSize(1440, 900));
    const sidebar = page.getByRole("separator", { name: "Resize sidebar" });
    await sidebar.focus(); await page.keyboard.press("Home"); await page.keyboard.press("ArrowRight");
    assert.equal(await sidebar.getAttribute("aria-valuenow"), "236");
    await page.getByRole("button", { name: "Toggle context", exact: true }).click();
    const context = page.getByRole("separator", { name: "Resize context" });
    await context.focus(); await page.keyboard.press("Home"); await page.keyboard.press("ArrowLeft");
    assert.equal(await context.getAttribute("aria-valuenow"), "316");
    const handle = await context.boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 50); await page.mouse.down();
    await page.mouse.move(handle.x - 40, handle.y + 50, { steps: 5 }); await page.mouse.up();
    assert(Number(await context.getAttribute("aria-valuenow")) > 350);
    const inspector = page.getByRole("complementary", { name: "Context inspector" });
    for (const tab of ["Files", "Review", "Web sources", "Activity", "Canvas"]) {
      await inspector.getByRole("button", { name: tab, exact: true }).click();
      await scanAccessibility(page, `Context ${tab}`);
    }
    await ctx.capture("10-context-canvas");
    await inspector.getByRole("button", { name: "Close context", exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Toggle context");
    await page.getByRole("button", { name: "Toggle context", exact: true }).click();
    assert.equal(await inspector.getByRole("button", { name: "Canvas", exact: true }).getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Escape");
  });
}

async function contextKeyboardProof(ctx) {
  await ctx.check("palette-opened context retains file focus and returns Escape to Toggle context", async () => {
    const page = ctx.getPage();
    await command(page, "Open Review");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Close context");
    await page.keyboard.press("Tab"); await page.keyboard.press("Space");
    for (let index = 0; index < 6; index++) await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("title")), "brief.md");
    await page.keyboard.press("Space");
    await page.getByLabel("Attached project context").getByText("brief.md", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("title")), "brief.md");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-disabled")), "true");
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Toggle context");
    await page.getByRole("button", { name: "Remove brief.md", exact: true }).click();
  });
}

async function libraryProof(ctx) {
  await ctx.check("command palette opens reusable runs; saving, replay review and draft preparation retain authority", async () => {
    const page = ctx.getPage(); const before = ctx.fixture.requests.length;
    await command(page, "Open Library");
    await page.getByRole("button", { name: "All runs", exact: true }).click();
    await page.locator(".run-library-row").filter({ hasText: "Remember this local conversation." }).first().click();
    const details = page.getByRole("dialog");
    await details.getByRole("button", { name: "Save run", exact: true }).click();
    await details.getByRole("button", { name: "Saved", exact: true }).waitFor();
    await scanAccessibility(page, "Reusable run details");
    await page.keyboard.press("Escape"); await details.waitFor({ state: "hidden" });
    await page.locator(".run-library-row").filter({ hasText: "Remember this local conversation." }).first().click();
    await details.getByRole("button", { name: "Review replay", exact: true }).click();
    await details.getByRole("heading", { name: "Replay review", exact: true }).waitFor();
    await ctx.capture("11-run-replay-review");
    await details.getByRole("button", { name: "Prepare replay", exact: true }).click();
    await details.waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.querySelector("#vanta-composer")?.value.includes("Remember this local conversation."));
    assert.equal(ctx.fixture.requests.length, before, "preparing a replay must not run the model");
  });
  await ctx.check("Library bulk trash and restore preserve the never-sent draft", async () => {
    const page = ctx.getPage(); await command(page, "Open Library");
    await page.getByRole("navigation", { name: "Library sections", exact: true }).getByRole("button", { name: "Chats", exact: true }).click();
    const manager = page.getByRole("region", { name: "Manage chats" });
    await manager.getByRole("searchbox", { name: "Find saved chats" }).fill("Never-sent draft proof");
    await manager.getByRole("button", { name: "Select visible", exact: true }).click();
    await manager.getByRole("button", { name: "Move to Trash", exact: true }).click();
    await manager.getByText("No matching conversations in this collection.", { exact: true }).waitFor();
    await manager.getByLabel("Chat collection").selectOption("trash");
    await manager.getByRole("checkbox", { name: "Select Never-sent draft proof" }).waitFor();
    await scanAccessibility(page, "Chat trash management");
    await manager.getByRole("button", { name: "Select visible", exact: true }).click();
    await manager.getByRole("button", { name: "Restore", exact: true }).click();
    await manager.getByLabel("Chat collection").selectOption("recent");
    await manager.getByRole("button", { name: /^Never-sent draft proof/ }).click();
    await page.waitForFunction(() => document.querySelector("#vanta-composer")?.value === "Retain me through a failed save.");
  });
  await ctx.check("twelve repeated filtered Library commands preserve the selected chat", async () => {
    const page = ctx.getPage(); const before = await ctx.api("/api/status");
    for (let index = 0; index < 12; index++) {
      await command(page, "Open Library");
      await page.getByRole("navigation", { name: "Library sections", exact: true }).getByRole("button", { name: "Chats", exact: true }).waitFor();
      assert.equal((await ctx.api("/api/status")).sessionId, before.sessionId);
    }
    await page.locator('.chat-nav-open').filter({ hasText: "Never-sent draft proof" }).click();
  });
}

async function approvalProof(ctx) {
  await ctx.check("approval denial makes no file change; fresh allow-once works while outside the chat view", async () => {
    const page = ctx.getPage(); const before = await readFile(join(ctx.project, "brief.md"), "utf8");
    await page.evaluate(async () => {
      const response = await fetch("/api/access-mode", { method: "POST", headers: { "content-type": "application/json", "x-vanta-desktop-boundary": window.vantaDesktop.boundaryToken }, body: JSON.stringify({ mode: "ask" }) });
      if (!response.ok) throw new Error(`Access mode: ${response.status}`);
    });
    await ctx.send("Approval proof denied: propose a bounded edit to brief.md.");
    await page.locator(".inline-approval").waitFor();
    await page.getByRole("button", { name: "Mini Vanta", exact: true }).click();
    await page.locator('.chat-first-shell[data-surface="mini"]').waitFor();
    await scanAccessibility(page, "Approval in Mini Vanta");
    await page.locator(".inline-approval").getByRole("button", { name: "Reject", exact: true }).click();
    await ctx.idle(); assert.equal(await readFile(join(ctx.project, "brief.md"), "utf8"), before);
    await page.getByRole("button", { name: "Expand Vanta", exact: true }).click();
    await page.locator('.chat-first-shell[data-surface="full"]').waitFor();
    await ctx.send("Approval proof allowed: propose a bounded edit to brief.md.");
    await page.locator(".inline-approval").waitFor();
    await openChatUtility(page, "Library");
    const approval = page.getByRole("dialog");
    await approval.getByRole("button", { name: "Allow once", exact: true }).waitFor();
    await scanAccessibility(page, "Approval outside conversation"); await ctx.capture("12-approval-overlay");
    await approval.getByRole("button", { name: "Allow once", exact: true }).click();
    await approval.waitFor({ state: "hidden" });
    await page.locator('.chat-nav-open').filter({ hasText: "Keep this response open" }).first().click();
    await ctx.idle(); assert.equal(await readFile(join(ctx.project, "brief.md"), "utf8"), before.replace("# Local desktop proof", "# Approved local edit"));
  });
}

async function busyNavigationProof(ctx) {
  await ctx.check("running chat remains reachable and stoppable from another workspace", async () => {
    const page = ctx.getPage();
    await ctx.send("Keep this response open");
    await page.getByRole("button", { name: "Stop task", exact: true }).waitFor();
    await openChatUtility(page, "Library");
    await page.getByRole("button", { name: "Return to running chat", exact: true }).click();
    await page.getByRole("button", { name: "Stop task", exact: true }).waitFor();
    await openChatUtility(page, "Library");
    await page.getByRole("button", { name: "Stop response", exact: true }).click();
    await page.getByRole("button", { name: "Stop response", exact: true }).waitFor({ state: "hidden" });
    await page.locator(".chat-nav-open").filter({ hasText: "Keep this response open" }).first().click();
    await ctx.idle();
  });
}

async function workspaceProof(ctx) {
  await ctx.check("Connections routes Telegram setup; all workspaces have accessible narrow and enlarged layouts", async () => {
    const page = ctx.getPage(); await command(page, "Set up Telegram");
    await page.getByRole("heading", { name: /Telegram/ }).first().waitFor();
    await ctx.capture("13-telegram-setup");
    await command(page, "Open Library");
    await page.getByRole("button", { name: "Workflows", exact: true }).click();
    await scanAccessibility(page, "Workflow history");
    for (const name of ["Today", "Outputs", "Schedules", "Skills & tools", "Connections"]) {
      await openChatUtility(page, name);
      await scanAccessibility(page, name);
    }
    const window = await ctx.getApp().browserWindow(page);
    await window.evaluate((win) => win.setContentSize(760, 900));
    await page.getByRole("button", { name: "Hide sidebar", exact: true }).click();
    await command(page, "Open Library");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await scanAccessibility(page, "Narrow library"); await ctx.capture("14-narrow-library");
    await window.evaluate((win) => { win.setContentSize(1440, 900); win.webContents.setZoomFactor(2); });
    await scanAccessibility(page, "Library at 200 percent zoom");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await ctx.capture("15-enlarged-library");
    await window.evaluate((win) => win.webContents.setZoomFactor(1));
    await page.getByRole("button", { name: "Show sidebar", exact: true }).click();
  });
}
