import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { useTheme, type Theme } from "./theme.js";
import { highlightLine, type HlSeg } from "./highlight.js";

// Minimal markdown renderer for the transcript: fenced code blocks, h1–h3,
// bullet/numbered lists, inline **bold** and `code`. Theme-colored (headings →
// accent, code → info). Italic is skipped on purpose — `*` shows up too often in
// tool output and prose to treat reliably as emphasis.

export type InlineToken = { text: string; bold?: true; code?: true };

export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) tokens.push({ text: text.slice(last, m.index) });
    const raw = m[0]!;
    if (raw.startsWith("`")) tokens.push({ text: raw.slice(1, -1), code: true });
    else tokens.push({ text: raw.slice(2, -2), bold: true });
    last = m.index + raw.length;
  }
  if (last < text.length) tokens.push({ text: text.slice(last) });
  return tokens;
}

export type Block =
  | { type: "code"; lang: string; lines: string[] }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "bullet"; text: string }
  | { type: "numbered"; n: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "spacer" }
  | { type: "table"; headers: string[]; rows: string[][] };

const MAX_CELL = 40;

function parseCells(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

function isSepLine(line: string): boolean {
  return /^\|[\s|:-]+\|$/.test(line.trim());
}

function parseTableBlock(
  lines: string[],
  from: number,
): { block: Block; end: number } | null {
  const headerLine = lines[from]!;
  const sepLine = lines[from + 1] ?? "";
  if (!headerLine.trim().startsWith("|") || !isSepLine(sepLine)) return null;
  const headers = parseCells(headerLine);
  const rows: string[][] = [];
  let i = from + 2;
  while (i < lines.length && lines[i]!.trim().startsWith("|")) {
    rows.push(parseCells(lines[i]!));
    i++;
  }
  return { block: { type: "table", headers, rows }, end: i };
}

function parseFencedCode(lines: string[], from: number): { block: Block; end: number } {
  const lang = lines[from]!.slice(3).trim();
  const codeLines: string[] = [];
  let i = from + 1;
  while (i < lines.length && !lines[i]!.startsWith("```")) codeLines.push(lines[i++]!);
  return { block: { type: "code", lang, lines: codeLines }, end: i + 1 };
}

export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("```")) { const r = parseFencedCode(lines, i); blocks.push(r.block); i = r.end; continue; }
    const hm = line.match(/^(#{1,})\s+(.*)/);
    if (hm) { blocks.push({ type: "heading", level: Math.min(hm[1]!.length, 3) as 1 | 2 | 3, text: hm[2]! }); i++; continue; }
    const bm = line.match(/^[-*]\s+(.*)/);
    if (bm) { blocks.push({ type: "bullet", text: bm[1]! }); i++; continue; }
    const nm = line.match(/^(\d+)\.\s+(.*)/);
    if (nm) { blocks.push({ type: "numbered", n: Number(nm[1]), text: nm[2]! }); i++; continue; }
    if (line.trim().startsWith("|")) {
      const tr = parseTableBlock(lines, i);
      if (tr) { blocks.push(tr.block); i = tr.end; continue; }
    }
    blocks.push(line.trim() === "" ? { type: "spacer" } : { type: "paragraph", text: line });
    i++;
  }
  return blocks;
}

function Inline(props: { tokens: InlineToken[] }): ReactElement {
  const t = useTheme();
  return (
    <>
      {props.tokens.map((tok, i) => {
        if (tok.code) return <Text key={i} color={t.info}>{tok.text}</Text>;
        if (tok.bold) return <Text key={i} bold color={t.primary}>{tok.text}</Text>;
        return <Text key={i} color={t.primary}>{tok.text}</Text>;
      })}
    </>
  );
}

function TableView(props: { block: Extract<Block, { type: "table" }>; theme: Theme }): ReactElement {
  const { headers, rows } = props.block;
  const t = props.theme;
  const colWidths = headers.map((h, ci) => {
    const dataMax = rows.reduce((acc, r) => Math.max(acc, (r[ci] ?? "").length), 0);
    return Math.min(Math.max(h.length, dataMax), MAX_CELL);
  });
  const pad = (s: string, w: number) => s.slice(0, w).padEnd(w);
  const sep = colWidths.map((w) => "─".repeat(w)).join("  ");
  return (
    <Box flexDirection="column">
      <Text bold color={t.accent}>
        {headers.map((h, ci) => pad(h, colWidths[ci]!)).join("  ")}
      </Text>
      <Text dimColor>{sep}</Text>
      {rows.map((row, ri) => (
        <Text key={ri} color={t.primary}>
          {headers.map((_, ci) => pad(row[ci] ?? "", colWidths[ci]!)).join("  ")}
        </Text>
      ))}
    </Box>
  );
}

/** A syntax-highlighted code line: keyword→accent, string→success, number→
 * warning, comment→dim, plain→primary. Two-space indent matches the block. */
function CodeLine(props: { line: string; lang: string; theme: Theme }): ReactElement {
  const segs = highlightLine(props.line, props.lang);
  return <Text>{"  "}{segs.map((s, i) => <Seg key={i} seg={s} theme={props.theme} />)}</Text>;
}

function Seg(props: { seg: HlSeg; theme: Theme }): ReactElement {
  const { seg, theme: t } = props;
  if (seg.cls === "comment") return <Text dimColor={t.dimText}>{seg.text}</Text>;
  const color = seg.cls === "keyword" ? t.accent : seg.cls === "string" ? t.success : seg.cls === "number" ? t.warning : t.primary;
  return <Text color={color}>{seg.text}</Text>;
}

function BlockView(props: { block: Block; theme: Theme }): ReactElement {
  const b = props.block;
  const t = props.theme;
  if (b.type === "spacer") return <Text> </Text>;
  if (b.type === "code") return (
    <Box flexDirection="column">
      {b.lang ? <Text dimColor={t.dimText}>{`  ${b.lang}`}</Text> : null}
      {b.lines.map((l, j) => <CodeLine key={j} line={l} lang={b.lang} theme={t} />)}
    </Box>
  );
  if (b.type === "heading") return <Text bold color={t.accent}>{"#".repeat(b.level)} <Inline tokens={tokenizeInline(b.text)} /></Text>;
  if (b.type === "bullet") return <Text>{"  • "}<Inline tokens={tokenizeInline(b.text)} /></Text>;
  if (b.type === "numbered") return <Text>{`  ${b.n}. `}<Inline tokens={tokenizeInline(b.text)} /></Text>;
  if (b.type === "table") return <TableView block={b} theme={t} />;
  return <Text><Inline tokens={tokenizeInline(b.text)} /></Text>;
}

export function Markdown(props: { text: string }): ReactElement {
  const theme = useTheme();
  const blocks = parseBlocks(props.text);
  return (
    <Box flexDirection="column">
      {blocks.map((b, i) => <BlockView key={i} block={b} theme={theme} />)}
    </Box>
  );
}
