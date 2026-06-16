import { z } from "zod";
import type { Tool } from "./types.js";
import { isAllowedDomain } from "../browser/allowlist.js";
import {
  BrowserActionSchema,
  type BrowserAction,
  previewActions,
  riskyActions,
} from "../browser/act.js";
import { runActions } from "./browser-act-run.js";

const Args = z.object({
  actions: z.array(BrowserActionSchema).min(1),
  observe: z.boolean().optional(),
});

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
      "Returns the resulting page's visible text. " +
      "Set observe:true to also return a numbered list of interactable elements (links, buttons, inputs) " +
      "with suggested selectors — use this to ground the next click before issuing it. " +
      "Pass a `secret:true` flag on a type action to mask + gate it. " +
      "Disabled when VANTA_BROWSER_DISABLED is set.",
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
        observe: {
          type: "boolean",
          description:
            "When true, append a numbered list of the page's interactable elements after the body text. " +
            "Use this to identify selectors before clicking. Default false.",
        },
      },
      required: ["actions"],
    },
  },
  // Benign summary → kernel Allows; the tool owns its own risky-action +
  // unlisted-domain approval below (routed through the kernel's approval queue).
  describeForSafety: (a) => `drive browser: ${(a.actions as unknown[])?.length ?? 0} action(s)`,
  async execute(raw, ctx) {
    // Kill-switch: VANTA_BROWSER_DISABLED disables all browser body actions.
    if (process.env.VANTA_BROWSER_DISABLED) {
      return { ok: false, output: "browser body disabled (VANTA_BROWSER_DISABLED)" };
    }

    const parsed = Args.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, output: 'browser_act needs an "actions" array (navigate/click/type/press/scroll/wait)' };
    }
    const { actions, observe } = parsed.data;

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
    return runActions(chromium, process.env, actions, observe);
  },
};
