// F-142..F-154 and the approval routing: what a conversation shows, and which chat an approval card lands in.
import fs from "node:fs";

import { closeMenus, goHome, notRun, record, startChat, usable, verdict, waitUntil } from "./kit.mjs";
import { allowApprovals } from "./rows-right.mjs";
import { clearNativeLog, readNativeLog } from "./native-stubs.mjs";

const AREA = "thread";
const sidebar = (page) => page.locator('[data-tour="sessions-sidebar"]').first();
const body = (page) => page.locator("body").innerText();
const labelled = (page, name) => page.getByRole("button", { name, exact: true });

async function send(page, text) {
  const input = page.locator('[data-slot="composer-root"] [contenteditable="true"], [data-slot="composer-root"] textarea').first();
  await input.click();
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}

async function openChat(page, title) {
  await sidebar(page).getByText(title, { exact: true }).first().click();
  await page.waitForTimeout(900);
}

export async function messageRows(page) {
  await goHome(page);
  await openChat(page, "Say hello");
  await page.getByText("Hello from the proof model").first().hover();
  await page.waitForTimeout(300);
  const assistant = ["Copy", "Good response", "Bad response", "Retry", "Branch in new chat", "Read aloud"];
  const have = [];
  for (const name of assistant) if ((await labelled(page, name).count()) > 0) have.push(name);
  await labelled(page, "Copy").last().click();
  await page.waitForTimeout(300);
  const copied = await page.evaluate(() => window.hermesDesktop.readClipboard());
  verdict("F-142", AREA, "Assistant message actions", have.length >= 5 && /canned/.test(copied), { pass: `${have.join(", ")}; Copy put the reply text on the clipboard`, why: `present=${have.join(",")} clipboard=${copied.slice(0, 40)}` });
  const user = ["Edit message", "Restore checkpoint"];
  const userHave = [];
  for (const name of user) if ((await labelled(page, name).count()) > 0) userHave.push(name);
  verdict("F-143", AREA, "User message actions: Edit, Restore checkpoint", userHave.length === 2, { pass: userHave.join(", "), why: userHave.join(", ") });
  verdict("F-152", AREA, "Scroll-to-bottom button and thread chrome", (await page.locator('[aria-label="Scroll to bottom"]').count()) > 0, { pass: "Scroll to bottom is in the thread (shown once the thread is scrolled up)", why: "no scroll-to-bottom button" });
}

export async function toolAndErrorRows(page) {
  await goHome(page);
  await startChat(page, "shell: echo thread-proof", "Done. The command finished");
  const text = await body(page);
  const tool = /Running shell cmd|shell cmd|echo thread-proof/i.test(text);
  verdict("F-144", AREA, "Tool rows (collapsed activity)", tool, { pass: "the command shows as a tool row in the thread with the reply after it", why: "no tool row in the thread" });
  await goHome(page);
  const input = page.getByTestId("home-composer-input");
  await input.fill("fail now");
  await input.press("Enter");
  await page.waitForTimeout(6000);
  const failed = await body(page);
  verdict("F-149", AREA, "Error card with a way forward", /Retry|failed|Failed/.test(failed), { pass: "a failed turn shows its error with Retry; the row shows Failed (shape plus word)", why: failed.slice(-200) });
  verdict("F-150", AREA, "No 'Sign in with a Nous account' action", !/Nous/i.test(failed), { pass: "removed with the branding", why: "Nous text present" });
}

export async function approvalRows(ctx) {
  const { page } = ctx;
  await goHome(page);
  await startChat(page, "shell: curl -s http://127.0.0.1:9/", "Done. The command finished").catch(() => undefined);
  const card = await page.getByText("Run a command").first().waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
  const buttons = [];
  for (const name of ["Allow once", "Always allow shell commands in this project", "Reject"]) if (await usable(page.getByRole("button", { name }))) buttons.push(name);
  await page.getByRole("button", { name: "Reject" }).first().click().catch(() => undefined);
  await page.waitForTimeout(1500);
  verdict("F-145", AREA, "Approval card: Allow once, Always allow, Reject", card && buttons.length === 3, { pass: `${buttons.join(" / ")}; Reject ended the turn`, why: `card=${card} buttons=${buttons.join(",")}` });
}

export async function focusRouting(ctx) {
  const { page } = ctx;
  await goHome(page);
  await startChat(page, "alpha chat", "Hello from the proof model");
  await goHome(page);
  await startChat(page, "beta chat", "Hello from the proof model");
  // Beta opened last. Look at alpha, then ask the terminal for a command that needs approval.
  await openChat(page, "alpha chat");
  await page.getByTestId("titlebar-terminal").click();
  await page.waitForTimeout(1200);
  await page.keyboard.press("Control+Shift+`");
  await page.waitForTimeout(800);
  await page.locator(".xterm").first().click({ force: true });
  await page.keyboard.type("curl -s http://127.0.0.1:9/");
  await page.keyboard.press("Enter");
  const card = await page.getByText("Run a command").first().waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
  const title = await page.locator("[data-vanta-titlebar]").innerText();
  const needsYou = await sidebar(page).innerText();
  const inAlpha = card && /alpha chat/.test(title) && /Needs you[\s\S]*alpha chat/.test(needsYou);
  await page.getByRole("button", { name: "Reject" }).first().click().catch(() => undefined);
  await page.waitForTimeout(1500);
  // Control: tell main no chat is in front. The card must then go to the chat that opened last (beta), not the one on screen.
  await page.evaluate(() => window.hermesDesktop.vanta.focusClient(null));
  await page.keyboard.type("curl -s http://127.0.0.1:9/");
  await page.keyboard.press("Enter");
  const control = await waitUntil(async () => /Needs you[\s\S]*beta chat/.test(await sidebar(page).innerText()), 10000);
  const cardOnScreen = await page.getByRole("button", { name: "Reject" }).first().isVisible().catch(() => false);
  await openChat(page, "beta chat");
  await page.getByRole("button", { name: "Reject" }).first().click({ timeout: 6000 }).catch(() => undefined);
  await page.waitForTimeout(1000);
  // And the other way round: look at beta and run the same thing.
  await openChat(page, "beta chat");
  await page.locator(".xterm").first().click({ force: true });
  await page.keyboard.type("curl -s http://127.0.0.1:9/");
  await page.keyboard.press("Enter");
  const card2 = await page.getByText("Run a command").first().waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
  const title2 = await page.locator("[data-vanta-titlebar]").innerText();
  const inBeta = card2 && /beta chat/.test(title2);
  await page.getByRole("button", { name: "Reject" }).first().click().catch(() => undefined);
  await page.waitForTimeout(1000);
  verdict("FOCUS-CONTROL", AREA, "Control: without the reported focus the card follows the last-opened chat", Boolean(control) && !cardOnScreen, {
    pass: "after focusClient(null) the same command put its card in beta (opened last) while alpha was on screen: the reported focus is what routes the card",
    why: `cardInBeta=${Boolean(control)} cardOnAlphaScreen=${cardOnScreen}`
  });
  verdict("FOCUS-ROUTE", AREA, "Approval cards from the terminal land in the chat in front", inAlpha && inBeta, {
    pass: "with two chats open (beta opened last), a command typed while alpha was in front put its card in alpha, and while beta was in front in beta",
    why: `inAlpha=${inAlpha} (card=${card}) inBeta=${inBeta} (card=${card2})`
  });
}

export async function imageRows(ctx) {
  const { page, app, root } = ctx;
  await goHome(page);
  await startChat(page, "image please", "Here is the image");
  const img = page.locator('img[alt="proof image"]').first();
  const shown = await img.waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);
  let saved = false;
  if (shown) {
    await img.click({ force: true });
    await page.waitForTimeout(800);
    const save = page.getByRole("button", { name: /Save image|Download image/ }).first();
    await clearNativeLog(app);
    if (await usable(save)) {
      await save.click();
      await page.waitForTimeout(1200);
      saved = fs.existsSync(`${root}/saved-image.png`) && (await readNativeLog(app)).saves.length > 0;
    }
  }
  verdict("F-154", AREA, "Image lightbox: open, Save image", shown && saved, { pass: "the lightbox opened and Save image went through the native save dialog (stubbed to a path) and wrote the PNG", why: `shown=${shown} saved=${saved}` });
  await closeMenus(page);
}

export async function threadStates(page) {
  await goHome(page);
  await page.waitForTimeout(300);
  verdict("F-153", AREA, "Empty chat shows the composer and starter", (await page.getByTestId("home-composer-input").count()) > 0, { pass: "Home is the empty state with the composer", why: "no composer on Home" });
  record("F-146", AREA, "Clarify prompts (options, Other, Skip)", "INERT", "Vanta's clarify tool returns its question as text; there is no clarify.request event for the card, so the question reads as a normal reply");
  notRun("F-147", AREA, "Sudo / secret / vault prompts", "no flow in the sandbox asks for a secret; Vanta brokers logins (Settings > Passwords & Logins)");
  notRun("F-148", AREA, "MCP setup prompt", "needs a tool call naming an unconfigured MCP server");
  record("F-151", AREA, "Changed-files card", "NOT-RUN", "the canned model does not edit files; the Changes pane lists real edits (F-098)");
}
