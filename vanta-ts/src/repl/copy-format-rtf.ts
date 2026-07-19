// The RTF converter for the /copy command — the distinct RTF sub-concern split
// out of copy-format.ts for the size gate. Pure strings-in/string-out: control
// chars (\\ { }) are escaped so model/agent output can't break the RTF structure.

// Inline spans: **bold**, *italic* / _italic_, `code`, [text](url). Order matters —
// code is matched first so emphasis markers inside backticks stay literal. The
// grammar lives in this import-leaf module so both renderers share it without a
// circular import; the HTML path (copy-format.ts) imports INLINE_RE from here.
export const INLINE_RE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|(?<![\p{L}\p{N}_])_[^_\n]+_(?![\p{L}\p{N}_])|\[[^\]\n]+\]\([^)\n]+\))/gu;

/** Escape RTF control characters so literal text can't break the RTF structure. */
function escapeRtf(text: string): string {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}");
}

// Same inline grammar as the HTML path, reused for RTF run styling.
function inlineToRtf(text: string): string {
  let rtf = "";
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const raw = m[0]!;
    const idx = m.index!;
    if (idx > last) rtf += escapeRtf(text.slice(last, idx));
    rtf += inlineSpanToRtf(raw);
    last = idx + raw.length;
  }
  if (last < text.length) rtf += escapeRtf(text.slice(last));
  return rtf;
}

/** Convert one matched inline span to an RTF run (bold/italic/monospace). */
function inlineSpanToRtf(raw: string): string {
  if (raw.startsWith("`")) return `{\\f1 ${escapeRtf(raw.slice(1, -1))}}`;
  if (raw.startsWith("**")) return `{\\b ${escapeRtf(raw.slice(2, -2))}}`;
  if (raw.startsWith("*")) return `{\\i ${escapeRtf(raw.slice(1, -1))}}`;
  if (raw.startsWith("_")) return `{\\i ${escapeRtf(raw.slice(1, -1))}}`;
  const m = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (m) return `${escapeRtf(m[1]!)} (${escapeRtf(m[2]!)})`;
  return escapeRtf(raw);
}

/** RTF paragraph break between blocks. */
const RTF_PAR = "\\par\n";

/**
 * Convert markdown to a minimal RTF document ({\rtf1 … }) with bold/italic/
 * monospace runs and paragraph breaks. Control chars (\\ { }) in text are
 * escaped so content can't break the RTF structure. Empty input → a valid
 * empty document.
 */
export function markdownToRtf(md: string): string {
  const lines = md.split("\n");
  const body: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) code.push(lines[i++]!);
      body.push(`{\\f1 ${escapeRtf(code.join("\n")).replaceAll("\n", RTF_PAR)}}`);
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      body.push(`{\\b ${inlineToRtf(heading[2]!)}}`);
      i++;
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      body.push(`\\bullet ${inlineToRtf(bullet[1]!)}`);
      i++;
      continue;
    }
    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      body.push(`${escapeRtf(numbered[1]!)}. ${inlineToRtf(numbered[2]!)}`);
      i++;
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    body.push(inlineToRtf(line));
    i++;
  }
  // \f0 = proportional default, \f1 = monospace for code runs.
  const header = "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}{\\f1 Courier;}}\n";
  return header + body.join(RTF_PAR) + "}";
}
