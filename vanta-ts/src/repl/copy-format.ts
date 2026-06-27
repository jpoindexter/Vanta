// Pure format converters for the /copy command. The live /copy handler
// (repl/media-cmds.ts) copies the last assistant response to the clipboard;
// a `[md|html|rtf]` arg routes the text through one of these pure transforms
// FIRST. SECURITY: the response is model/agent output — the HTML path
// HTML-escapes all text (a `<script>` becomes escaped text, never a live tag)
// and the RTF path escapes control chars, so neither converter can inject
// markup. All three transforms are pure strings-in/string-out (no execution).
//
// WIRING (this round delivers the pure layer only — see media-cmds.ts copy):
//   const format = resolveCopyFormat(arg);                 // md (default) | html | rtf
//   const payload = formatForCopy(last.content, format);   // converts before the write
//   p.stdin.end(payload);                                  // existing clipboard boundary

import { INLINE_RE, markdownToRtf } from "./copy-format-rtf.js";

export { markdownToRtf };

/** The copy output formats. `md` is the raw-markdown default (current behavior). */
export type CopyFormat = "md" | "html" | "rtf";

const FORMATS: readonly CopyFormat[] = ["md", "html", "rtf"] as const;
const DEFAULT_FORMAT: CopyFormat = "md";

/** Resolve a user arg to a CopyFormat; unknown/empty/extra-spaced/mixed-case → md. */
export function resolveCopyFormat(arg: string): CopyFormat {
  const normalized = arg.trim().toLowerCase();
  return (FORMATS as readonly string[]).includes(normalized)
    ? (normalized as CopyFormat)
    : DEFAULT_FORMAT;
}

/** HTML-escape text so model output can't inject tags/attributes. */
function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Render one line of inline markdown to HTML, escaping all literal text. */
function inlineToHtml(text: string): string {
  let html = "";
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const raw = m[0]!;
    const idx = m.index!;
    if (idx > last) html += escapeHtml(text.slice(last, idx));
    html += inlineSpanToHtml(raw);
    last = idx + raw.length;
  }
  if (last < text.length) html += escapeHtml(text.slice(last));
  return html;
}

/** Convert one matched inline span (already known to be a span) to HTML. */
function inlineSpanToHtml(raw: string): string {
  if (raw.startsWith("`")) return `<code>${escapeHtml(raw.slice(1, -1))}</code>`;
  if (raw.startsWith("**")) return `<strong>${escapeHtml(raw.slice(2, -2))}</strong>`;
  if (raw.startsWith("*")) return `<em>${escapeHtml(raw.slice(1, -1))}</em>`;
  if (raw.startsWith("_")) return `<em>${escapeHtml(raw.slice(1, -1))}</em>`;
  const m = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (m) return `<a href="${escapeHtml(m[2]!)}">${escapeHtml(m[1]!)}</a>`;
  return escapeHtml(raw);
}

type ListKind = "ul" | "ol";

/** Close an open list tag if one is open, returning the closing token (or ""). */
function closeList(open: ListKind | null): string {
  return open ? `</${open}>` : "";
}

/** Open a list of the given kind if not already open; returns opening markup + new state. */
function openList(open: ListKind | null, kind: ListKind): { markup: string; open: ListKind } {
  if (open === kind) return { markup: "", open };
  const close = closeList(open);
  return { markup: close ? `${close}\n<${kind}>` : `<${kind}>`, open: kind };
}

type HtmlState = { out: string[]; openListKind: ListKind | null };

/** Render a `- `/`1. ` list item, opening the right list tag in state first. */
function pushHtmlListItem(state: HtmlState, kind: ListKind, content: string): void {
  const o = openList(state.openListKind, kind);
  if (o.markup) state.out.push(o.markup);
  state.openListKind = o.open;
  state.out.push(`<li>${inlineToHtml(content)}</li>`);
}

/** Emit a non-list block, closing any open list first. Returns true if it handled the line. */
function pushHtmlNonListBlock(state: HtmlState, line: string): boolean {
  const heading = line.match(/^(#{1,6})\s+(.*)$/);
  if (heading) {
    state.out.push(closeList(state.openListKind));
    state.openListKind = null;
    state.out.push(`<h${heading[1]!.length}>${inlineToHtml(heading[2]!)}</h${heading[1]!.length}>`);
    return true;
  }
  if (line.trim() === "") {
    state.out.push(closeList(state.openListKind));
    state.openListKind = null;
    return true;
  }
  return false;
}

/**
 * Convert markdown to a safe HTML string. Handles headings (#…######), bold,
 * italic, inline code, fenced code blocks, links, unordered (- ) + ordered (1. )
 * lists, and paragraphs. All literal text is HTML-escaped — model output can't
 * inject tags. Returns an empty string for empty input.
 */
export function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const state: HtmlState = { out: [], openListKind: null };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("```")) {
      state.out.push(closeList(state.openListKind));
      state.openListKind = null;
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) code.push(lines[i++]!);
      state.out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      i++;
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) { pushHtmlListItem(state, "ul", bullet[1]!); i++; continue; }
    const numbered = line.match(/^\d+\.\s+(.*)$/);
    if (numbered) { pushHtmlListItem(state, "ol", numbered[1]!); i++; continue; }
    if (pushHtmlNonListBlock(state, line)) { i++; continue; }
    state.out.push(closeList(state.openListKind));
    state.openListKind = null;
    state.out.push(`<p>${inlineToHtml(line)}</p>`);
    i++;
  }
  state.out.push(closeList(state.openListKind));
  return state.out.filter((s) => s !== "").join("\n");
}

/** Route text through the chosen format. md → unchanged, html → markdownToHtml, rtf → markdownToRtf. */
export function formatForCopy(text: string, format: CopyFormat): string {
  if (format === "html") return markdownToHtml(text);
  if (format === "rtf") return markdownToRtf(text);
  return text;
}
