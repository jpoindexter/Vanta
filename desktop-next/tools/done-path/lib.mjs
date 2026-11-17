// Page-level helpers shared by the done-path steps. All selectors are the app's own data hooks.
import { waitForShell } from "../vanta-app.mjs";

export { waitForShell };

const COMPOSER = "[data-vp='composer-input']";
const CARD = "[data-vp='approval-card']";
export const FINISHED_TEXT = "Scripted turn finished.";
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Count approval cards as they are mounted, so a card that flashes by is still seen. */
export async function watchApprovals(page) {
  await page.evaluate((selector) => {
    window.__dpCards = 0;
    const seen = new WeakSet();
    const scan = () => document.querySelectorAll(selector).forEach((el) => {
      if (!seen.has(el)) { seen.add(el); window.__dpCards += 1; }
    });
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
    scan();
  }, CARD);
}

export const cardsSeen = (page) => page.evaluate(() => window.__dpCards ?? 0);

/**
 * Tap the main process's renderer channel: every frame carrying an approval request is kept, so the
 * proof reads the payload the server really pushed (not what the card chose to display).
 */
export async function installApprovalTap(app) {
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    if (contents.__dpTapped) return;
    contents.__dpTapped = true;
    globalThis.__dpApprovals = [];
    const send = contents.send.bind(contents);
    contents.send = (channel, ...args) => {
      try {
        const text = JSON.stringify(args);
        if (text.includes('"approval.request"') || text.includes('"type":"approval')) globalThis.__dpApprovals.push(JSON.parse(text));
      } catch { /* not serialisable: not an approval frame */ }
      return send(channel, ...args);
    };
  });
}

/** The most recent approval payload the server pushed, or null. */
export async function latestApproval(app) {
  const frames = await app.evaluate(() => globalThis.__dpApprovals ?? []);
  const find = (value) => {
    if (typeof value === "string" && value.includes("approval")) { try { return find(JSON.parse(value)); } catch { return null; } }
    if (!value || typeof value !== "object") return null;
    if (value.approval && typeof value.approval === "object" && value.approval.id) return value.approval;
    for (const child of Object.values(value)) { const hit = find(child); if (hit) return hit; }
    return null;
  };
  for (const frame of [...frames].reverse()) { const hit = find(frame); if (hit) return hit; }
  return null;
}

export async function newChat(page) {
  await page.locator('[data-tour="sidebar-nav-new-session"]').click();
  await page.locator(COMPOSER).first().waitFor({ state: "visible", timeout: 15_000 });
}

export async function sendText(page, text) {
  const composer = page.locator(COMPOSER).first();
  await composer.click();
  await page.keyboard.insertText(text);
  await page.keyboard.press("Enter");
}

/** Poll until an approval card is on screen ("card"), the scripted turn ended ("finished") or time ran out. */
export async function waitOutcome(page, { timeout = 30_000, finishedBefore = 0 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await page.evaluate(({ selector, finished }) => ({
      cards: document.querySelectorAll(selector).length,
      finished: document.body.innerText.split(finished).length - 1,
    }), { selector: CARD, finished: FINISHED_TEXT });
    if (state.cards > 0) return "card";
    if (state.finished > finishedBefore) return "finished";
    await sleep(150);
  }
  return "timeout";
}

export async function waitFinished(page, { timeout = 30_000, finishedBefore = 0 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const count = await page.evaluate((text) => document.body.innerText.split(text).length - 1, FINISHED_TEXT);
    if (count > finishedBefore) return true;
    await sleep(150);
  }
  return false;
}

export async function cardInfo(page) {
  return page.locator(CARD).first().evaluate((card) => ({
    text: card.innerText.replace(/\n+/g, " | "),
    buttons: [...card.querySelectorAll("button")].map((b) => b.innerText.trim()),
  }));
}

export const clickCard = (page, name) => page.locator(CARD).first().getByRole("button", { name }).click();

/** Two animation frames after a key: the time until the character is on screen. */
export async function keystrokeMs(page) {
  const start = Date.now();
  await page.keyboard.type("k");
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  return Date.now() - start;
}

export const composerText = (page) => page.locator(COMPOSER).first().evaluate((el) => el.innerText);

export async function settle(page, ms = 500) {
  await page.waitForTimeout(ms);
}
