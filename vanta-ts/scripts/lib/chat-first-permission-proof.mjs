import assert from "node:assert/strict";
import { mkdir, readFile, rename, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const original = "# Local desktop proof\nNo operator data.\n";

export async function permissionPersistenceProof(ctx) {
  const rules = join(ctx.proofHome, "permissions.tsv");
  await ctx.check("Always allow persists through packaged restart and a new chat without another prompt", async () => {
    let page = ctx.getPage();
    await writeFile(join(ctx.project, "brief.md"), original);
    await ctx.send("Approval proof remembered: make the bounded edit.");
    await page.locator(".inline-approval").getByRole("button", { name: "Always allow this tool", exact: true }).click();
    await ctx.idle();
    assert.match(await readFile(rules, "utf8"), /allow\tedit_file/);
    assert.match(await readFile(join(ctx.project, "brief.md"), "utf8"), /Approved local edit/);
    await ctx.restart(); page = ctx.getPage();
    await page.locator("button.chat-new").click();
    await writeFile(join(ctx.project, "brief.md"), original);
    await ctx.send("Approval proof another task: reuse the remembered edit rule.");
    await page.getByText("Local provider reply: Approval proof another task: reuse the remembered edit rule.", { exact: true }).waitFor();
    await ctx.idle();
    assert.equal(await page.locator(".inline-approval").count(), 0);
    assert.match(await readFile(join(ctx.project, "brief.md"), "utf8"), /Approved local edit/);
    await ctx.capture("18-remembered-approval");
  });
  await ctx.check("failed persistent approval denies the edit and keeps a visible error until dismissed", async () => {
    const page = ctx.getPage();
    await writeFile(rules, ""); // Reset only this disposable fixture, never operator preferences.
    await writeFile(join(ctx.project, "brief.md"), original);
    await ctx.send("Approval proof storage failure: propose the same edit.");
    const approval = page.locator(".inline-approval");
    await approval.getByRole("button", { name: "Always allow this tool", exact: true }).waitFor();
    await rename(rules, `${rules}.backup`); await mkdir(rules);
    try {
      await approval.getByRole("button", { name: "Always allow this tool", exact: true }).click();
      await page.getByText("Could not save the approval rule. The action was not approved.", { exact: true }).waitFor();
      await ctx.idle(); await page.waitForTimeout(2500); // Error must survive host polling.
      await page.getByRole("button", { name: "Dismiss", exact: true }).click();
      assert.equal(await readFile(join(ctx.project, "brief.md"), "utf8"), original);
    } finally { await rmdir(rules); await rename(`${rules}.backup`, rules); }
  });
  await rememberedDenialProof(ctx);
  await ctx.check("a blocked result with an open checklist stops without a forced continuation", async () => {
    const page = ctx.getPage();
    await page.locator("button.chat-new").click();
    const before = ctx.fixture.requests.length;
    await ctx.send("Blocked continuation proof: leave the required task open when the source is unavailable.");
    await page.getByText("Blocked: the required source is unavailable. No brief was written.", { exact: true }).first().waitFor();
    await ctx.idle(); await page.waitForTimeout(1000);
    assert.equal(ctx.fixture.requests.length - before, 2);
    assert.equal(await readFile(join(ctx.project, "brief.md"), "utf8"), original);
    assert(!ctx.fixture.requests.slice(before).some((request) => request.prompt.startsWith("Continue —")));
    await ctx.capture("19-blocked-without-forced-continuation");
  });
}

async function rememberedDenialProof(ctx) {
  await ctx.check("Never allow survives packaged restart and a new chat without changing the file", async () => {
    const rules = join(ctx.proofHome, "permissions.tsv");
    const target = join(ctx.project, "brief.md");
    await writeFile(rules, ""); // Disposable profile only; never operator permissions.
    await writeFile(target, original);
    let page = ctx.getPage();
    await page.locator("button.chat-new").click();
    await ctx.send("Approval proof remember denial: propose the bounded edit.");
    const approval = page.locator(".inline-approval");
    await approval.getByText("More permission options", { exact: true }).click();
    await approval.getByRole("button", { name: "Never allow this tool", exact: true }).click();
    await ctx.idle();
    assert.match(await readFile(rules, "utf8"), /deny\tedit_file/);
    assert.equal(await readFile(target, "utf8"), original);
    await ctx.restart(); page = ctx.getPage();
    await page.locator("button.chat-new").click();
    const prompt = "Approval proof denied in another task: do not reuse prior allow authority.";
    const before = ctx.fixture.requests.length;
    await ctx.send(prompt);
    await page.getByText(`Local provider reply: ${prompt}`, { exact: true }).waitFor();
    await ctx.idle();
    assert.equal(await page.locator(".inline-approval").count(), 0);
    assert.equal(await readFile(target, "utf8"), original);
    assert.equal(ctx.fixture.requests.length - before, 2, "denied action must not trigger automatic retries");
    await ctx.capture("20-remembered-denial");
  });
}
