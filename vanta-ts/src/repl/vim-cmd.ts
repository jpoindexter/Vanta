import { dirname } from "node:path";
import type { SlashHandler } from "./types.js";
import { setConfig } from "../cli-dx/config.js";

// /vim — toggle vi-mode in the TUI composer. Off by default. `/vim` flips it,
// `/vim on|off` sets it explicitly. The decision is pure (resolveVim); the host
// applies the `vimMode` signal to the live composer and we persist the choice to
// .env (VANTA_VIM) so it sticks across sessions — same pattern as /composer.

/** Resolve composer vi-mode from env. Default off. */
export function resolveVim(env: NodeJS.ProcessEnv): boolean {
  const v = env.VANTA_VIM?.trim().toLowerCase();
  return v === "1" || v === "on" || v === "true";
}

/** Decide the next vi-mode state from the current one + the arg ("", on, off). */
export function nextVim(current: boolean, arg: string): { next: boolean } | { error: string } {
  const a = arg.trim().toLowerCase();
  if (a === "" || a === "toggle") return { next: !current };
  if (a === "on" || a === "1" || a === "true") return { next: true };
  if (a === "off" || a === "0" || a === "false") return { next: false };
  return { error: `  unknown arg '${arg.trim()}' — use /vim, /vim on, or /vim off` };
}

export const vim: SlashHandler = async (arg, ctx) => {
  const current = resolveVim(ctx.env);
  const decision = nextVim(current, arg);
  if ("error" in decision) return { output: decision.error };
  const { next } = decision;
  if (next === current) return { output: `  vi-mode already ${current ? "on" : "off"}` };
  ctx.env.VANTA_VIM = next ? "1" : "0"; // keep this session's env consistent
  await setConfig(dirname(ctx.dataDir), "VANTA_VIM", next ? "1" : "0").catch(() => {});
  return { vimMode: next, output: `  ✓ vi-mode ${next ? "on — Esc for normal mode (hjkl/w/b/dd/yy/p/i/a/o)" : "off"}` };
};
