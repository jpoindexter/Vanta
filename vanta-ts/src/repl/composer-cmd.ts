import { dirname } from "node:path";
import type { SlashHandler } from "./types.js";
import { resolveComposerAnchor, type ComposerAnchor } from "../ui/pinned-region.js";
import { setConfig } from "../cli-dx/config.js";

// /composer — choose where the input box sits: "float" (default; just below the
// last line, like Claude Code) or "bottom" (pinned to the terminal floor, chat
// box). Returns a `composerAnchor` signal the TUI applies live, and persists the
// choice to .env (VANTA_COMPOSER_ANCHOR) so it sticks across sessions.

const MODES: ComposerAnchor[] = ["float", "bottom"];

const DESC: Record<ComposerAnchor, string> = {
  float: "float  — input sits just below the last line (default)",
  bottom: "bottom — pinned to the terminal floor (chat box)",
};

export const composer: SlashHandler = async (arg, ctx) => {
  const active = resolveComposerAnchor(ctx.env);
  if (!arg.trim()) {
    const list = MODES.map((m) => `  ${m === active ? "›" : " "} ${DESC[m]}`).join("\n");
    return { output: `Composer position (current: ${active}):\n${list}\n\nUse: /composer <float|bottom>` };
  }
  const mode = arg.trim().toLowerCase();
  if (!MODES.includes(mode as ComposerAnchor)) {
    return { output: `  unknown mode '${mode}' — use float or bottom` };
  }
  if (mode === active) return { output: `  already ${mode}` };
  ctx.env.VANTA_COMPOSER_ANCHOR = mode; // keep this session's env consistent
  // Persist to .env (repoRoot is the parent of dataDir = repoRoot/.vanta).
  await setConfig(dirname(ctx.dataDir), "VANTA_COMPOSER_ANCHOR", mode).catch(() => {});
  return { composerAnchor: mode as ComposerAnchor, output: `  ✓ composer ${mode}` };
};
