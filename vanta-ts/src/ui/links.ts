import { parseFileLine } from "../editor/open.js";

// Pure detector: find clickable spans in one transcript line. Two kinds:
//   - url : http/https links → open in the browser
//   - file: a path, optionally with :line[:col] → open in $VANTA_EDITOR
// Returns non-overlapping spans left→right so a renderer can splice plain text
// between them. No I/O — the renderer/affordance decides what to do per kind.

export type LinkSpan = {
  kind: "url" | "file";
  /** The exact matched substring (used as the visible label). */
  text: string;
  start: number;
  end: number;
  /** For url: the URL. For file: a `path` or `path:line` ref (parse with parseFileLine). */
  ref: string;
};

// http(s) URL. Stops at whitespace and the usual trailing punctuation so a URL
// at a sentence end ("see https://x.com.") doesn't swallow the period.
const URL_RE = /https?:\/\/[^\s<>()[\]]+/g;
// A path-ish token: at least one "/" (or a leading ./ ../ ~/) ending in a file
// extension, optionally followed by :line or :line:col. Kept deliberately narrow
// to avoid matching arbitrary prose; bare words are NOT treated as files.
const FILE_RE = /(?:\.{0,2}\/|~\/)?(?:[\w.@~+-]+\/)+[\w.@+-]+\.[A-Za-z][\w]*(?::\d+(?::\d+)?)?/g;

const trimTrailing = (s: string): string => s.replace(/[.,;:!?)\]'"]+$/, "");

function collect(line: string, re: RegExp, kind: LinkSpan["kind"]): LinkSpan[] {
  const out: LinkSpan[] = [];
  for (const m of line.matchAll(re)) {
    const raw = m[0]!;
    // For files, a trailing ":line" is meaningful — keep digits, trim only real punctuation.
    const text = kind === "url" ? trimTrailing(raw) : raw.replace(/[.,;!?)\]'"]+$/, "");
    if (!text) continue;
    const start = m.index;
    out.push({ kind, text, start, end: start + text.length, ref: text });
  }
  return out;
}

/** All http/https + file/file:line spans in `line`, ordered left→right and
 *  de-overlapped (a URL wins over a file path it contains). Pure. */
export function detectLinks(line: string): LinkSpan[] {
  const urls = collect(line, URL_RE, "url");
  const files = collect(line, FILE_RE, "file").filter((f) => !urls.some((u) => f.start >= u.start && f.start < u.end));
  return [...urls, ...files].sort((a, b) => a.start - b.start);
}

/** True when `line` has at least one clickable span. Cheap pre-check for renderers.
 *  Uses fresh non-global regexes so it stays pure (a global regex's lastIndex is
 *  stateful across calls). */
export function hasLinks(line: string): boolean {
  return new RegExp(URL_RE.source).test(line) || new RegExp(FILE_RE.source).test(line);
}

/** Resolve a span to what should be opened: a browser URL or an editor file:line.
 *  Pure — the caller performs the actual open. */
export function resolveLinkTarget(span: LinkSpan): { open: "browser"; url: string } | { open: "editor"; file: string; line: number } {
  if (span.kind === "url") return { open: "browser", url: span.ref };
  const { file, line } = parseFileLine(span.ref);
  return { open: "editor", file, line };
}
