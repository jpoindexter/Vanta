import { z } from "zod";
import type { Tool, ToolResult } from "./types.js";
import { isAllowedDomain } from "../browser/allowlist.js";
import { acquirePage } from "../browser/launch.js";
import {
  BrowserActionSchema,
  type BrowserAction,
  previewActions,
  riskyActions,
} from "../browser/act.js";

const Args = z.object({ actions: z.array(BrowserActionSchema).min(1) });

const GOTO_TIMEOUT_MS = 30_000;
const ACTION_TIMEOUT_MS = 10_000;
const MAX_OUTPUT = 20_000;
const MISSING_BROWSER = /Executable doesn't exist|playwright install|browserType\.launch/i;

function cap(text: string): string {
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
};

async function applyAct(page: ActPage, a: BrowserAction): Promise<void> {
  const t = { timeout: ACTION_TIMEOUT_MS };
  if (a.type === "navigate") return void (await page.goto(a.url, { timeout: GOTO_TIMEOUT_MS }));
  if (a.type === "click") return page.click(a.selector ?? `text=${a.text ?? ""}`, t);
  if (a.type === "type") return page.fill(a.selector, a.value, t);
  if (a.type === "press") return page.keyboard.press(a.key);
  if (a.type === "wait") return page.waitForTimeout(a.ms);
  // scroll — runs in page context where `window` exists at runtime.
  return page.evaluate(() => {
    const w = globalThis as unknown as { scrollBy: (x: number, y: number) => void; innerHeight: number };
    w.scrollBy(0, w.innerHeight);
  });
}

async function runActions(
  chromium: typeof import("playwright-core").chromium,
  env: NodeJS.ProcessEnv,
  actions: BrowserAction[],
): Promise<ToolResult> {
  let close: (() => Promise<void>) | null = null;
  try {
    const acquired = await acquirePage(chromium, env);
    close = acquired.close;
    const page = acquired.page as unknown as ActPage;
    for (const a of actions) await applyAct(page, a);
    return { ok: true, output: cap(await page.innerText("body")) };
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

/** Domains a navigate action visits that aren't on the allowlist. */
function unlistedDomains(actions: BrowserAction[]): string[] {
  return actions
    .filter((a): a is Extract<BrowserAction, { type: "navigate" }> => a.type === "navigate")
    .map((a) => a.url)
    .filter((url) => !isAllowedDomain(url));
}

export const browserActTool: Tool = {
  schema: {
    name: "browser_act",
    description:
      "Drive a browser page — navigate, click, type, press a key, scroll, or wait. " +
      "Irreversible actions (submit, buy, delete, login, send) and credential entry stop and ask first. " +
      "Returns the resulting page's visible text. Pass a `secret:true` flag on a type action to mask + gate it.",
    parameters: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          description: "Ordered actions to perform",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["navigate", "click", "type", "press", "scroll", "wait"] },
              url: { type: "string", description: "navigate: absolute URL" },
              selector: { type: "string", description: "click/type: CSS selector" },
              text: { type: "string", description: "click: visible text to match (alternative to selector)" },
              value: { type: "string", description: "type: text to enter" },
              secret: { type: "boolean", description: "type: mask the value + treat as risky (credential)" },
              key: { type: "string", description: "press: key name (e.g. Enter, Tab)" },
              ms: { type: "number", description: "wait: milliseconds" },
            },
            required: ["type"],
          },
        },
      },
      required: ["actions"],
    },
  },
  // Benign summary → kernel Allows; the tool owns its own risky-action +
  // unlisted-domain approval below (routed through the kernel's approval queue).
  describeForSafety: (a) => `drive browser: ${(a.actions as unknown[])?.length ?? 0} action(s)`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'browser_act needs an "actions" array (navigate/click/type/press/scroll/wait)' };
    }
    const { actions } = parsed.data;

    const risky = riskyActions(actions);
    const newDomains = unlistedDomains(actions);
    if (risky.length > 0 || newDomains.length > 0) {
      const reason = [
        risky.length > 0 ? `${risky.length} irreversible action(s)` : "",
        newDomains.length > 0 ? `new domain(s): ${newDomains.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; ");
      const approved = await ctx.requestApproval(
        `Drive the browser:\n${previewActions(actions)}`,
        reason,
      );
      if (!approved) return { ok: false, output: "denied by user" };
    }

    let chromium: typeof import("playwright-core").chromium;
    try {
      ({ chromium } = await import("playwright-core"));
    } catch {
      return { ok: false, output: "playwright-core is not installed. Run `npm i playwright-core`." };
    }
    return runActions(chromium, process.env, actions);
  },
};
