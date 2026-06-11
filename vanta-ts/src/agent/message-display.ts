import type { HookBus } from "../plugins/hooks.js";

// MessageDisplay: a hook that fires before an assistant message is shown, letting
// a plugin rewrite or suppress the DISPLAYED text. The raw text is always kept in
// the conversation transcript (what the model and tools see next) — this only
// changes what reaches the screen. The shipped example strips chain-of-thought
// (<thinking>…</thinking>) from the display while tools still receive it whole.

const THINKING_RE = /<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>\s*/gi;

/** Remove <thinking>…</thinking> (and <think>…</think>) blocks from text. Pure. */
export function stripThinking(text: string): string {
  return text.replace(THINKING_RE, "").trim();
}

/**
 * Run the message_display hook chain over assistant text bound for the screen.
 * Returns the (possibly rewritten) display text and whether a hook suppressed it.
 * A no-op — returns the text unchanged — when no bus or no hook acts on it.
 */
export async function applyMessageDisplay(
  bus: HookBus | undefined,
  text: string,
): Promise<{ text: string; suppressed: boolean }> {
  if (!bus || !text) return { text, suppressed: false };
  const action = await bus.fire("message_display", { text, role: "assistant" });
  if (action.action === "suppress") return { text: "", suppressed: true };
  if (action.action === "rewrite") return { text: action.rewrittenText ?? text, suppressed: false };
  return { text, suppressed: false };
}

/** Register the strip-thinking display hook on a bus. Returns the unsubscribe fn. */
export function registerStripThinking(bus: HookBus): () => void {
  return bus.on("message_display", ({ text }) => {
    const stripped = stripThinking(text);
    return stripped === text ? { action: "allow" } : { action: "rewrite", rewrittenText: stripped };
  });
}

function isEnabled(env: NodeJS.ProcessEnv): boolean {
  const v = (env.VANTA_STRIP_THINKING ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/** Wire the opt-in built-in display hooks (VANTA_STRIP_THINKING) onto a bus. */
export function installMessageDisplayHooks(bus: HookBus, env: NodeJS.ProcessEnv = process.env): void {
  if (isEnabled(env)) registerStripThinking(bus);
}
