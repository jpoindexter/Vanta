// VANTA-MAGIC-DOCS — keep designated markdown files (declared in
// `settings.magicDocs`, e.g. STATUS.md / PROGRESS.md) auto-maintained: after
// each turn a compact managed region (active goal, recent files touched, last
// action, timestamp) is refreshed BETWEEN marker comments, so hand-written
// content outside the markers is preserved byte-for-byte. No magic docs
// configured = no writes (today's behavior). The region-replace + summary-build
// are pure; the file write is best-effort (a failure never throws into a turn)
// and runs through an injected fs so the orchestration is fully unit-testable.

import type { Settings } from "../settings/store.js";

/** Markers bounding the managed region. HTML comments so they're invisible in
 *  rendered markdown. Only the content between them is ever rewritten. */
export const MAGIC_BEGIN = "<!-- vanta:magic-doc:begin -->";
export const MAGIC_END = "<!-- vanta:magic-doc:end -->";

/** The compact session snapshot the managed region is built from. Pure inputs —
 *  the timestamp is passed in, never read from the clock, so summaries are
 *  deterministic and testable. */
export type MagicSummaryInput = {
  /** The active goal text, or null when none is set. */
  activeGoal: string | null;
  /** Recently touched file paths, most-recent last (caller-ordered). */
  recentFiles: string[];
  /** The last action taken — typically the last tool name or a short phrase. */
  lastAction: string | null;
  /** ISO timestamp for the "updated" line. Injected (no `new Date()` here). */
  timestamp: string;
};

const MAX_RECENT_FILES = 8;

/** One field line, omitting empty values with a stable "(none)" placeholder. Pure. */
function field(label: string, value: string | null): string {
  const v = value && value.trim() ? value.trim() : "(none)";
  return `- **${label}:** ${v}`;
}

/**
 * Build the compact managed-region body from a session snapshot. Pure: same
 * input → same output, no I/O, no clock. The body is plain markdown (no
 * markers — `replaceManagedRegion` wraps it).
 */
export function buildMagicSummary(input: MagicSummaryInput): string {
  const files = input.recentFiles.filter((f) => f.trim()).slice(-MAX_RECENT_FILES);
  const filesLine = files.length ? files.join(", ") : null;
  return [
    "_Auto-maintained by Vanta — edits inside this block are overwritten._",
    "",
    field("Active goal", input.activeGoal),
    field("Recent files", filesLine),
    field("Last action", input.lastAction),
    field("Updated", input.timestamp),
  ].join("\n");
}

/** The fully-wrapped managed block (markers + body). Pure. */
function wrapRegion(summary: string): string {
  return `${MAGIC_BEGIN}\n${summary}\n${MAGIC_END}`;
}

/**
 * Replace ONLY the managed region of `existingContent` with `summary`. The block
 * between (and including) the markers is swapped; everything outside is
 * untouched. When the markers are absent, the block is appended at the end
 * (separated by a blank line, preserving any trailing content). Idempotent in
 * shape: a second call replaces the same region rather than nesting. Pure.
 */
export function replaceManagedRegion(existingContent: string, summary: string): string {
  const block = wrapRegion(summary);
  const begin = existingContent.indexOf(MAGIC_BEGIN);
  const end = existingContent.indexOf(MAGIC_END);
  if (begin !== -1 && end !== -1 && end > begin) {
    const before = existingContent.slice(0, begin);
    const after = existingContent.slice(end + MAGIC_END.length);
    return `${before}${block}${after}`;
  }
  if (existingContent === "") return block;
  const sep = existingContent.endsWith("\n") ? "\n" : "\n\n";
  return `${existingContent}${sep}${block}`;
}

/** The configured magic-doc paths, empty when unset. Pure. */
export function resolveMagicDocs(settings: Settings): string[] {
  return (settings.magicDocs ?? []).filter((p) => p.trim());
}

/** Injected filesystem seam — read-modify-write a single doc. Errors surface as
 *  rejections; `updateMagicDocs` swallows them per-doc (best-effort). */
export type MagicDocsFs = {
  /** Read a file's text; reject/throw when it doesn't exist (caller treats as ""). */
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
};

/** Read one doc's current content, treating a missing/unreadable file as empty. */
async function readExisting(fs: MagicDocsFs, path: string): Promise<string> {
  try {
    return await fs.readFile(path);
  } catch {
    return "";
  }
}

/**
 * Refresh the managed region of every configured doc with `summary`, via the
 * injected fs (read-modify-write). Best-effort and per-doc isolated: a read or
 * write failure on one doc is swallowed (counted as not-written), never thrown
 * into the turn. An empty `docs` list writes nothing. Returns the paths that
 * were successfully written (errors-as-values for the caller).
 */
export async function updateMagicDocs(
  docs: string[],
  summary: string,
  fs: MagicDocsFs,
): Promise<string[]> {
  const written: string[] = [];
  for (const path of docs) {
    try {
      const existing = await readExisting(fs, path);
      const next = replaceManagedRegion(existing, summary);
      if (next !== existing) await fs.writeFile(path, next);
      written.push(path);
    } catch {
      /* best-effort — one bad doc never breaks the turn or the other docs */
    }
  }
  return written;
}
