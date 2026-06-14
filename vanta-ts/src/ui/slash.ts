import { SLASH_COMMANDS } from "../repl/catalog.js";

// Pure slash-command helpers for the v2 composer: detect a slash line, match the
// partial against the catalog for the palette, and expand a partial to the full
// command on Tab/Enter. No React, no IO — just string logic the composer drives.

export type SlashMatch = { name: string; arg?: string; desc: string };

const PALETTE_LIMIT = 8;

/** A slash command line: starts with `/` and the first token has no nested `/`
 * (so file paths like `/foo/bar` and URLs are NOT treated as commands). */
export function isSlashLine(line: string): boolean {
  if (!line.startsWith("/")) return false;
  const firstToken = line.slice(1).split(/\s/)[0] ?? "";
  return !firstToken.includes("/");
}

/** The command word after the slash, before any space. */
export function slashHead(line: string): string {
  return line.slice(1).split(/\s+/)[0] ?? "";
}

/** Catalog entries whose name starts with the partial — only while the name is
 * still being typed (no space yet). Empty once an argument is being entered.
 * `extra` (skill entries) appear after builtins; builtins win on name collision. */
export function matchSlash(line: string, extra: SlashMatch[] = [], limit = PALETTE_LIMIT): SlashMatch[] {
  if (!line.startsWith("/") || line.slice(1).includes(" ")) return [];
  const head = slashHead(line);
  const builtins = SLASH_COMMANDS.filter((c) => c.name.startsWith(head));
  const buildinNames = new Set(builtins.map((c) => c.name));
  const skills = extra.filter((s) => s.name.startsWith(head) && !buildinNames.has(s.name));
  return [...builtins, ...skills].slice(0, limit);
}

/** Expand a partial to the selected match's full command (`/mo` → `/model`). */
export function completeSlash(line: string, matches: SlashMatch[], sel: number): string {
  const m = matches[Math.min(sel, matches.length - 1)] ?? matches[0];
  return m ? `/${m.name}` : line;
}

/** True when the line is an unfinished command name (palette open, no exact hit)
 * — Enter should first expand it before dispatching. */
export function isPartialSlash(line: string, matches: SlashMatch[]): boolean {
  if (!line.startsWith("/") || line.slice(1).includes(" ") || matches.length === 0) return false;
  return !matches.some((m) => m.name === slashHead(line));
}
