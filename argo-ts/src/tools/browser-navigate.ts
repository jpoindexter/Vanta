import { z } from "zod";
import type { Tool } from "./types.js";
import { isAllowedDomain } from "../browser/allowlist.js";

const ActionSchema = z.object({
  type: z.enum(["click", "fill", "scroll"]),
  selector: z.string().min(1).optional(),
  value: z.string().optional(),
});

const Args = z.object({
  url: z.string().url(),
  actions: z.array(ActionSchema).optional(),
});

type Action = z.infer<typeof ActionSchema>;

const GOTO_TIMEOUT_MS = 30_000;
const ACTION_TIMEOUT_MS = 10_000;
const MAX_OUTPUT = 20_000;
const TRUNCATED_MARKER = "\n\n…[truncated]";

// Playwright surfaces a missing browser binary with one of these substrings;
// we translate it into an actionable install hint instead of a raw stack.
const MISSING_BROWSER = /Executable doesn't exist|playwright install|browserType\.launch/i;

function cap(text: string): string {
  if (text.length <= MAX_OUTPUT) return text;
  return text.slice(0, MAX_OUTPUT - TRUNCATED_MARKER.length) + TRUNCATED_MARKER;
}

/**
 * Apply one page action. Kept narrow (no DOM types leak out) so the heavy
 * playwright import stays inside execute(). `page` is the lazily-imported
 * Playwright Page; typed as the action runner needs, not the full surface.
 */
async function applyAction(
  // playwright-core's Page type isn't imported at top level (lazy dep); the
  // structural shape we use is declared inline to avoid an `any`.
  page: {
    click: (s: string, o: { timeout: number }) => Promise<void>;
    fill: (s: string, v: string, o: { timeout: number }) => Promise<void>;
    evaluate: (fn: () => void) => Promise<void>;
  },
  action: Action,
): Promise<void> {
  if (action.type === "scroll") {
    // Runs in the page context where `window` exists at runtime. The Node-side
    // tsconfig has no DOM lib, so reach the browser global structurally.
    await page.evaluate(() => {
      const w = globalThis as unknown as {
        scrollBy: (x: number, y: number) => void;
        innerHeight: number;
      };
      w.scrollBy(0, w.innerHeight);
    });
    return;
  }
  if (!action.selector) {
    throw new Error(`${action.type} action requires a "selector"`);
  }
  if (action.type === "click") {
    await page.click(action.selector, { timeout: ACTION_TIMEOUT_MS });
    return;
  }
  // fill
  await page.fill(action.selector, action.value ?? "", {
    timeout: ACTION_TIMEOUT_MS,
  });
}

export const browserNavigateTool: Tool = {
  schema: {
    name: "browser_navigate",
    description:
      "Open a URL in a headless browser, run a short sequence of actions (click, fill, scroll), and return the resulting page's visible text.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The absolute URL to open" },
        actions: {
          type: "array",
          description: "Ordered actions to perform after the page loads",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["click", "fill", "scroll"],
                description: "Action kind",
              },
              selector: {
                type: "string",
                description: "CSS selector (required for click/fill)",
              },
              value: {
                type: "string",
                description: "Text to type (fill only)",
              },
            },
            required: ["type"],
          },
        },
      },
      required: ["url"],
    },
  },
  describeForSafety: (a) => `navigate ${String(a.url ?? "")}`,
  async execute(raw, ctx) {
    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        output: 'browser_navigate needs a valid "url" and optional "actions"',
      };
    }
    const { url, actions = [] } = parsed.data;

    if (!isAllowedDomain(url)) {
      const approved = await ctx.requestApproval(
        `Navigate the browser to ${url}`,
        "domain is not in VANTA_ALLOWED_DOMAINS — visiting it loads remote content",
      );
      if (!approved) {
        return { ok: false, output: "denied by user" };
      }
    }

    // Lazy import keeps Argo bootable when playwright-core isn't installed.
    let chromium: typeof import("playwright-core").chromium;
    try {
      ({ chromium } = await import("playwright-core"));
    } catch {
      return {
        ok: false,
        output:
          "playwright-core is not installed. Run `npm i playwright-core` to enable browser tools.",
      };
    }

    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    try {
      browser = await chromium.launch();
      const page = await browser.newPage();
      await page.goto(url, { timeout: GOTO_TIMEOUT_MS });
      for (const action of actions) {
        await applyAction(page, action);
      }
      const text = await page.innerText("body");
      return { ok: true, output: cap(text) };
    } catch (err) {
      const message = (err as Error).message;
      if (MISSING_BROWSER.test(message)) {
        return {
          ok: false,
          output:
            "No browser binary found. Run `npx playwright install chromium` to download it.",
        };
      }
      return { ok: false, output: `browser_navigate failed: ${message}` };
    } finally {
      await browser?.close();
    }
  },
};
