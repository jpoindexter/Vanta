import type { ToolResult } from "./types.js";
import { acquirePage } from "../browser/launch.js";
import type { BrowserAction } from "../browser/act.js";
import { summarizeElements, formatElements, type RawElement } from "../browser/observe.js";

// Browser action execution helpers. Extracted from browser-act.ts (size gate).

const GOTO_TIMEOUT_MS = 30_000;
const ACTION_TIMEOUT_MS = 10_000;
const MAX_OUTPUT = 20_000;
export const MISSING_BROWSER = /Executable doesn't exist|playwright install|browserType\.launch/i;

export function cap(text: string): string {
  const marker = "\n\n…[truncated]";
  return text.length <= MAX_OUTPUT ? text : text.slice(0, MAX_OUTPUT - marker.length) + marker;
}

// The page surface the body drives. Declared structurally — playwright-core's
// Page type isn't imported at top level (lazy dep, no DOM lib Node-side).
type ActPage = {
  goto: (url: string, opts: { timeout: number }) => Promise<unknown>;
  click: (selector: string, opts: { timeout: number }) => Promise<void>;
  fill: (selector: string, value: string, opts: { timeout: number }) => Promise<void>;
  keyboard: { press: (key: string) => Promise<void> };
  waitForTimeout: (ms: number) => Promise<void>;
  evaluate: (fn: () => void) => Promise<void>;
  innerText: (selector: string) => Promise<string>;
  $$eval: <T>(selector: string, fn: (els: Element[]) => T) => Promise<T>;
};

export async function applyAct(page: ActPage, a: BrowserAction): Promise<void> {
  const t = { timeout: ACTION_TIMEOUT_MS };
  if (a.type === "navigate") return void (await page.goto(a.url, { timeout: GOTO_TIMEOUT_MS }));
  if (a.type === "click") return page.click(a.selector ?? `text=${a.text ?? ""}`, t);
  if (a.type === "type") return page.fill(a.selector, a.value, t);
  if (a.type === "press") return page.keyboard.press(a.key);
  if (a.type === "wait") return page.waitForTimeout(a.ms);
  return page.evaluate(() => {
    const w = globalThis as unknown as { scrollBy: (x: number, y: number) => void; innerHeight: number };
    w.scrollBy(0, w.innerHeight);
  });
}

type PageEl = {
  tagName: string;
  innerText?: string;
  name?: string;
  type?: string;
  id?: string;
  getAttribute: (name: string) => string | null;
};

async function collectElements(page: ActPage): Promise<string> {
  try {
    const raw = await page.$$eval(
      "a,button,input,select,textarea,[role=link],[role=button],[role=textbox],[role=combobox]",
      (els) =>
        (els as unknown as PageEl[]).map((el) => ({
          tag: el.tagName.toLowerCase(),
          text: (el.innerText ?? "").slice(0, 80),
          role: el.getAttribute("role") ?? undefined,
          name: el.name || el.getAttribute("aria-label") || undefined,
          type: el.type ?? undefined,
          selectorHint: el.id ? `#${el.id}` : undefined,
        })),
    ) as RawElement[];
    const elements = summarizeElements(raw);
    return `\n\n--- interactable elements ---\n${formatElements(elements)}`;
  } catch {
    return "";
  }
}

export async function runActions(
  chromium: typeof import("playwright-core").chromium,
  env: NodeJS.ProcessEnv,
  actions: BrowserAction[],
  observe?: boolean,
): Promise<ToolResult> {
  let close: (() => Promise<void>) | null = null;
  try {
    const acquired = await acquirePage(chromium, env);
    close = acquired.close;
    const page = acquired.page as unknown as ActPage;
    for (const a of actions) await applyAct(page, a);
    const bodyText = cap(await page.innerText("body"));
    const observeBlock = observe ? await collectElements(page) : "";
    return { ok: true, output: bodyText + observeBlock };
  } catch (err) {
    const message = (err as Error).message;
    if (MISSING_BROWSER.test(message)) {
      return { ok: false, output: "No browser binary found. Run `npx playwright install chromium`." };
    }
    return { ok: false, output: `browser_act failed: ${message}` };
  } finally {
    await close?.();
  }
}
