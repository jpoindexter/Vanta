import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { scanAccessibility } from "./desktop-accessibility-proof.mjs";

/** Review-found regressions on the packaged shell; only the model is synthetic. */
export async function retainedCapabilityProof(ctx) {
  await queueControls(ctx);
  await failedQueueRetry(ctx);
  await failedSelection(ctx);
  await settingsHandoff(ctx);
  await replayInputs(ctx);
  await settlingNavigation(ctx);
}

async function settlingNavigation(ctx) {
  await ctx.check("navigation remains visibly unavailable until the completed response reaches canonical history", async () => {
    const page = ctx.getPage(); await newChat(page);
    let release, finishRoute;
    const settled = new Promise((resolve) => { release = resolve; });
    const continued = new Promise((resolve) => { finishRoute = resolve; });
    await page.route("**/api/sessions/open", async (route) => {
      await settled;
      try { await route.continue(); } finally { finishRoute(); }
    });
    try {
      await ctx.send("Retain the completed response before allowing another chat.");
      await page.getByText("Local provider reply: Retain the completed response before allowing another chat.", { exact: true }).waitFor();
      await page.getByText("Updating conversation…", { exact: true }).waitFor();
      assert.equal(await page.locator("button.chat-new").isDisabled(), true);
      assert.equal(await page.locator("#vanta-composer").isDisabled(), true);
    } finally {
      release(); await continued; await page.unroute("**/api/sessions/open");
    }
    await newChat(page);
  });
}

async function newChat(page) {
  await page.locator("button.chat-new").click();
  await page.waitForFunction(() => {
    const input = document.querySelector("#vanta-composer");
    return input && !input.disabled && input.value === "";
  });
}

async function queueMessage(page, text) {
  await page.locator("#vanta-composer").fill(text);
  await page.getByRole("button", { name: "Queue next", exact: true }).click();
  await page.locator(".chat-inline-queue li").filter({ hasText: text }).waitFor();
}

async function queueControls(ctx) {
  await ctx.check("packaged queue retains revision-bound reorder and steering controls", async () => {
    const page = ctx.getPage();
    await newChat(page); await ctx.send("Keep this response open for queue controls");
    await page.getByRole("button", { name: "Stop task", exact: true }).waitFor();
    await queueMessage(page, "First ordered instruction");
    await queueMessage(page, "Second ordered instruction");
    const second = page.locator(".chat-inline-queue li").filter({ hasText: "Second ordered instruction" });
    await second.getByRole("button", { name: "Move earlier", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".chat-inline-queue li .chat-queued-text")?.textContent === "Second ordered instruction");
    let snapshot = await ctx.api("/api/chat/queue");
    assert.deepEqual(snapshot.items.map((item) => item.instruction), ["Second ordered instruction", "First ordered instruction"]);
    await second.getByRole("button", { name: "Move later", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".chat-inline-queue li .chat-queued-text")?.textContent === "First ordered instruction");
    await second.getByRole("button", { name: "Steer now", exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll(".chat-inline-queue li")].some((row) => row.textContent.includes("Second ordered instruction") && row.querySelector(".chat-queue-target")?.textContent.includes("Steer now")));
    snapshot = await ctx.api("/api/chat/queue");
    assert.equal(snapshot.items.find((item) => item.instruction === "Second ordered instruction").intent, "steer");
    await scanAccessibility(page, "Queue ordering and steering"); await ctx.capture("review-queue-controls");
    while (await page.locator(".chat-inline-queue li").count()) {
      const count = await page.locator(".chat-inline-queue li").count();
      await page.getByRole("button", { name: "Remove queued message", exact: true }).first().click();
      await page.waitForFunction((count) => document.querySelectorAll(".chat-inline-queue li").length < count, count);
    }
    await page.getByRole("button", { name: "Stop task", exact: true }).click(); await ctx.idle();
  });
}

async function failedQueueRetry(ctx) {
  await ctx.check("an interrupted queued turn requires explicit retry and executes only on the next submitted turn", async () => {
    const page = ctx.getPage(); const text = "Keep this response open for explicit queued retry";
    await newChat(page); await ctx.send("Keep this response open before retry proof");
    await page.getByRole("button", { name: "Stop task", exact: true }).waitFor();
    await queueMessage(page, text);
    ctx.fixture.release();
    await page.locator('.chat-inline-queue li[data-status="starting"]').waitFor();
    await page.getByRole("button", { name: "Stop task", exact: true }).click(); await ctx.idle();
    await page.getByRole("button", { name: "Retry message", exact: true }).waitFor();
    const before = ctx.fixture.requests.length;
    await page.getByRole("button", { name: "Retry message", exact: true }).click();
    await page.locator('.chat-inline-queue li[data-status="queued"]').waitFor();
    assert.equal(ctx.fixture.requests.length, before, "retry must not auto-submit a new turn");
    await ctx.send("Continue the explicitly retried queue");
    await page.locator('.chat-inline-queue li[data-status="starting"]').waitFor();
    ctx.fixture.release(); await ctx.idle();
    await page.getByRole("region", { name: "Queued messages" }).waitFor({ state: "hidden" });
    assert.equal(ctx.fixture.requests.filter((request) => request.prompt === text).length, 2, "one original attempt plus one explicit retry");
  });
}

async function nameChat(page, name) {
  const active = page.locator('.chat-nav-row[data-active="true"]');
  await active.getByRole("button", { name: /^Actions for/ }).click();
  await active.getByRole("button", { name: "Rename", exact: true }).click();
  await active.getByLabel("Chat name").fill(name);
  await active.getByRole("button", { name: "Save name", exact: true }).click();
  await page.locator(".chat-header-title").getByText(name, { exact: true }).waitFor();
}

async function failedSelection(ctx) {
  await ctx.check("failed chat selection preserves the prior draft and rejects mismatched-session sends before the provider", async () => {
    const page = ctx.getPage();
    await newChat(page); await nameChat(page, "Selection owner A");
    await page.locator("#vanta-composer").fill("Draft owned by A");
    await newChat(page); await nameChat(page, "Selection owner B");
    await page.locator("#vanta-composer").fill("Draft owned by B");
    await page.locator(".chat-nav-open").filter({ hasText: "Selection owner A" }).click();
    await page.waitForFunction(() => document.querySelector("#vanta-composer")?.value === "Draft owned by A");
    const before = await ctx.api("/api/status");
    await page.route("**/api/sessions/open", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Proof: unavailable chat" }) }));
    await page.locator(".chat-nav-open").filter({ hasText: "Selection owner B" }).click();
    await page.getByText("Proof: unavailable chat", { exact: true }).waitFor();
    assert.equal(await page.locator(".chat-header-title").innerText(), "Selection owner A");
    assert.equal(await page.locator("#vanta-composer").inputValue(), "Draft owned by A");
    assert.equal((await ctx.api("/api/status")).sessionId, before.sessionId);
    await page.unroute("**/api/sessions/open");
    await page.locator(".chat-nav-open").filter({ hasText: "Selection owner B" }).click();
    await page.waitForFunction(() => document.querySelector("#vanta-composer")?.value === "Draft owned by B");
    const requests = ctx.fixture.requests.length;
    const result = await post(page, "/api/chat", { sessionId: before.sessionId, message: "Must not cross chats" });
    assert.equal(result.status, 409); assert.equal(ctx.fixture.requests.length, requests);
    await ctx.capture("review-chat-ownership");
  });
}

async function settingsHandoff(ctx) {
  await ctx.check("Settings hands keyboard focus to the model and provider dialogs without a covering layer", async () => {
    const page = ctx.getPage();
    for (const button of ["Change model", "Connect provider"]) {
      await page.locator(".chat-sidebar").getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Model", exact: true }).click();
      await page.getByRole("button", { name: button, exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 1 && ![...document.querySelectorAll('[role="dialog"] h2')].some((heading) => heading.textContent === "Settings"));
      for (let index = 0; index < 8; index++) {
        await page.keyboard.press("Tab");
        assert(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))));
      }
      await scanAccessibility(page, `Settings to ${button}`);
      await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert(await page.locator(".chat-sidebar").getByRole("button", { name: "Settings", exact: true }).evaluate((button) => document.activeElement === button));
    }
  });
}

async function post(page, path, body) {
  return page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-vanta-desktop-boundary": window.vantaDesktop.boundaryToken }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }, { path, body });
}

async function replayInputs(ctx) {
  await ctx.check("replay preserves structured input hashes and detects later source drift without auto-executing", async () => {
    const page = ctx.getPage();
    await newChat(page);
    await page.getByRole("button", { name: "Toggle context", exact: true }).click();
    await page.getByRole("complementary", { name: "Context inspector" }).getByRole("button", { name: "Files", exact: true }).click();
    await page.getByRole("textbox", { name: "Find a project file", exact: true }).fill("brief.md");
    await page.getByRole("button", { name: "brief.md attach", exact: true }).click();
    await page.getByRole("button", { name: "Close context", exact: true }).click();
    await ctx.send("Retained input provenance proof"); await ctx.idle();
    const original = (await ctx.api("/api/runs")).find((run) => run.prompt.includes("Retained input provenance proof"));
    assert.equal(original.inputs.length, 1); assert.equal(original.inputs[0].path, "brief.md");
    await page.keyboard.press("Meta+k");
    await page.getByRole("combobox", { name: "Search commands" }).fill("Open Library"); await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "All runs", exact: true }).click();
    await page.locator(".run-library-row").filter({ hasText: "Retained input provenance proof" }).first().click();
    await page.getByRole("button", { name: "Review replay", exact: true }).click();
    const count = ctx.fixture.requests.length;
    await page.getByRole("button", { name: "Prepare replay", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Remove brief.md", exact: true }).waitFor();
    assert.equal(ctx.fixture.requests.length, count);
    const request = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/api/chat"));
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const sent = (await request).postDataJSON();
    assert.deepEqual(sent.files, ["brief.md"]); assert.equal(sent.message.split("@brief.md").length - 1, 1);
    await ctx.idle();
    const replay = (await ctx.api("/api/runs")).find((run) => run.lineage.parentRunId === original.id);
    assert.equal(replay.inputs[0].sha256, original.inputs[0].sha256); assert.equal(replay.inputs[0].path, "brief.md");
    const path = join(ctx.project, "brief.md"), originalBytes = await readFile(path);
    try {
      await writeFile(path, `${originalBytes.toString()}\nDisposable input drift.\n`);
      const preview = await post(page, "/api/runs", { action: "preview", id: replay.id });
      assert.equal(preview.status, 200);
      assert.equal(preview.body.inputs.find((input) => input.path === "brief.md").state, "changed");
      assert.equal(preview.body.canExecute, false);
    } finally { await writeFile(path, originalBytes); }
    await ctx.capture("review-replay-provenance");
  });
}
