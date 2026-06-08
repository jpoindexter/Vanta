import path from "node:path";

// OSC-8 hyperlink helpers for file:line references in the TUI.
// Supported by iTerm2, WezTerm, Ghostty, Kitty, and most modern terminals.
// Pure — no filesystem calls, no side effects.

/** Source-file extensions that are meaningful to linkify. */
const LINKABLE_EXTS = new Set([
  "ts", "tsx", "js", "mjs", "cjs",
  "rs", "md", "json", "toml", "yaml", "yml", "sh", "py",
]);

/**
 * Wraps `text` in an OSC-8 hyperlink escape sequence pointing to `url`.
 * Terminals that don't understand OSC-8 display `text` as-is (graceful).
 */
export function osc8Link(text: string, url: string): string {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

/**
 * Builds a `file://` URL for `absPath` (with optional `line`) and wraps
 * the basename[:line] display text in an OSC-8 escape.
 */
export function fileLink(absPath: string, line?: number): string {
  const url = `file://${absPath}${line !== undefined ? `:${line}` : ""}`;
  const display = `${path.basename(absPath)}${line !== undefined ? `:${line}` : ""}`;
  return osc8Link(display, url);
}

/**
 * Matches `word/word.ext:123` or `src/foo.ts:45` style references.
 * Captures: [1] path, [2] line (optional).
 */
export const FILE_LINE_RE = /\b([\w./\-]+\.[a-z]{1,6})(?::(\d+))?\b/g;

/**
 * Replaces source-file path references in `text` with OSC-8 hyperlinks.
 * Resolves relative paths against `root`. Extensions not in LINKABLE_EXTS
 * are left alone. Pure — no filesystem access.
 */
export function linkifyFilePaths(text: string, root: string): string {
  return text.replace(FILE_LINE_RE, (match, filePath: string, lineStr?: string) => {
    const ext = filePath.split(".").pop() ?? "";
    if (!LINKABLE_EXTS.has(ext)) return match;
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
    const line = lineStr !== undefined ? parseInt(lineStr, 10) : undefined;
    return fileLink(absPath, line);
  });
}
