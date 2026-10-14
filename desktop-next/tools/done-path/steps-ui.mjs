// Steps h and i of the done criterion: the composer never freezes, and the shell collapses per the wireframe.
import { keystrokeMs, composerText, newChat, sendText, settle, sleep, waitFinished } from "./lib.mjs";

const KEY_BUDGET_MS = 250;
const BIG_TEXT = "lorem ipsum dolor sit amet ".repeat(8000).slice(0, 200 * 1024);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function measureKeys(page, count = 5) {
  const samples = [];
  for (let i = 0; i < count; i += 1) samples.push(await keystrokeMs(page));
  return samples;
}

const dispatchPaste = (page, kind) => page.locator("[data-vp='composer-input']").first().evaluate(async (el, { type, text }) => {
  const data = new DataTransfer();
  if (type === "text") {
    data.setData("text/plain", text);
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext("2d");
    context.fillStyle = "#7c3aed"; context.fillRect(0, 0, 64, 64);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    data.items.add(new File([blob], "screenshot.png", { type: "image/png" }));
  }
  const started = performance.now();
  el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  return performance.now() - started;
}, { type: kind, text: BIG_TEXT });

/** h1: paste 200 KB, keep typing within the keystroke budget, keep the draft, then send it. */
export async function stepLargePaste(ctx) {
  const { page } = ctx.cur;
  await newChat(page);
  await page.locator("[data-vp='composer-input']").first().click();
  const baseline = await measureKeys(page, 3);
  await page.keyboard.type(" draft-start ");
  const pasteMs = await dispatchPaste(page, "text");
  await sleep(1500);
  const keys = await measureKeys(page);
  const draft = await composerText(page);
  await ctx.shot("h1-large-paste");
  const requestsBefore = ctx.model.requests.length;
  await page.keyboard.press("Enter");
  const sent = await waitFinished(page, { timeout: 45_000 });
  const sentRequests = ctx.model.requests.slice(requestsBefore);
  const request = sentRequests.reduce((best, r) => (r.promptLength > (best?.promptLength ?? 0) ? r : best), null);
  const after = await composerText(page);
  const failures = [];
  if (Math.max(...keys) > KEY_BUDGET_MS) failures.push(`a keystroke took ${Math.max(...keys)} ms after the paste (budget ${KEY_BUDGET_MS})`);
  if (draft.length < BIG_TEXT.length || !draft.includes("draft-start")) failures.push(`draft lost or shortened (${draft.length} chars)`);
  if (!sent) failures.push("the 200 KB message was not answered");
  if ((request?.promptLength ?? 0) < BIG_TEXT.length) failures.push(`the model received ${request?.promptLength} chars, expected at least ${BIG_TEXT.length}`);
  if (after.trim().length > 20) failures.push("composer was not cleared after send");
  ctx.evidence("h1-latency", { baseline, keys, pasteMs, draftChars: draft.length, receivedChars: request?.promptLength, requests: sentRequests });
  if (failures.length) throw new Error(failures.join("; "));
  return { baselineMaxMs: Math.max(...baseline), afterPasteMaxMs: Math.max(...keys), afterPasteMedianMs: median(keys), pasteMs: Math.round(pasteMs) };
}

/** h2: paste an image next to a draft: no freeze, the draft survives. h3 (probe): the image attaches. */
export async function stepImagePaste(ctx) {
  const { page } = ctx.cur;
  await newChat(page);
  await page.locator("[data-vp='composer-input']").first().click();
  await page.keyboard.type("image-draft ");
  const pasteMs = await dispatchPaste(page, "image");
  await sleep(1500);
  const keys = await measureKeys(page);
  const draft = await composerText(page);
  const toast = await page.evaluate(() => (/Image attach failed[^\n]*\n?[^\n]*/.exec(document.body.innerText) ?? [""])[0]);
  const attached = await page.evaluate(() => Boolean(document.querySelector("[data-slot*='attachment'] img, [data-vp*='attach'] img, img[src^='blob:']")));
  await ctx.shot("h2-image-paste");
  ctx.evidence("h2-image", { keys, pasteMs, draft: draft.slice(0, 80), toast, attached });
  ctx.probe("h3", "pasted image becomes an attachment on the message", attached, { toast });
  const failures = [];
  if (Math.max(...keys) > KEY_BUDGET_MS) failures.push(`a keystroke took ${Math.max(...keys)} ms after the image paste`);
  if (!draft.includes("image-draft")) failures.push(`draft lost after the image paste (${JSON.stringify(draft.slice(0, 60))})`);
  if (failures.length) throw new Error(failures.join("; "));
  return { afterPasteMaxMs: Math.max(...keys), attached, toast };
}

const measureLayout = (page) => page.evaluate(() => {
  const rail = document.querySelector("aside[data-slot='sidebar']")?.getBoundingClientRect();
  const full = document.querySelector('[data-tour="sessions-sidebar"]')?.getBoundingClientRect();
  const overflow = ["html", "body", "#root"].filter((sel) => {
    const el = document.querySelector(sel);
    return el && el.scrollWidth > el.clientWidth;
  });
  return { railW: rail ? Math.round(rail.width) : 0, fullW: full ? Math.round(full.width) : 0, overflow, viewport: innerWidth };
});

const WIDTHS = {
  1440: { size: [1440, 900], expect: (m) => (m.fullW >= 250 && m.fullW <= 300 ? [] : [`full sidebar width ${m.fullW}, expected about 275`]) },
  1100: { size: [1100, 800], expect: (m) => (m.railW >= 48 && m.railW <= 72 && m.fullW === 0 ? [] : [`expected a 56px rail, got rail ${m.railW} / sidebar ${m.fullW}`]) },
  800: { size: [800, 700], expect: (m) => (m.railW <= 1 && m.fullW === 0 ? [] : [`expected the sidebar collapsed to a drawer, got rail ${m.railW} / sidebar ${m.fullW}`]) },
};

/** i: the shell at one width: expected collapse, no horizontal overflow, and at 800 the drawer opens and closes. */
export async function stepResponsive(ctx, width) {
  const { page, resize } = ctx.cur;
  const spec = WIDTHS[width];
  await resize(...spec.size);
  await settle(page, 700);
  const metrics = await measureLayout(page);
  const failures = [...spec.expect(metrics)];
  if (metrics.overflow.length) failures.push(`horizontal overflow on ${metrics.overflow.join(", ")}`);
  if (width === 800) failures.push(...(await checkDrawer(ctx)));
  await ctx.shot(`i-${width}`);
  ctx.evidence(`i-${width}`, metrics);
  if (width === 800) await resize(1440, 900);
  if (failures.length) throw new Error(failures.join("; "));
  return metrics;
}

async function checkDrawer(ctx) {
  const { page } = ctx.cur;
  await page.getByTestId("titlebar-sidebar").click();
  await settle(page, 700);
  const open = await page.evaluate(() => {
    const r = document.querySelector('[data-tour="sessions-sidebar"]')?.getBoundingClientRect();
    return r ? { x: Math.round(r.x), w: Math.round(r.width) } : null;
  });
  await ctx.shot("i-800-drawer");
  await page.keyboard.press("Escape");
  await settle(page, 600);
  const closed = await page.evaluate(() => document.querySelector('[data-tour="sessions-sidebar"]') === null);
  const failures = [];
  if (!open || open.w < 200 || open.x < -1) failures.push(`drawer did not open from the toggle (${JSON.stringify(open)})`);
  if (!closed) failures.push("drawer did not close on Escape");
  return failures;
}
