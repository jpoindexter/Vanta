import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { highlightLine, type HlSeg } from "./highlight.js";
import { LinkedText } from "./linked-text.js";
import { layoutTable, parseAlignments, type Align } from "./markdown-table.js";

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
  | { type: "table"; headers: string[]; rows: string[][]; aligns: Align[] };


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
  const aligns = parseAlignments(parseCells(sepLine), headers.length);
  const rows: string[][] = [];
  let i = from + 2;
  while (i < lines.length && lines[i]!.trim().startsWith("|")) {
    rows.push(parseCells(lines[i]!));
    i++;
  }
  return { block: { type: "table", headers, rows, aligns }, end: i };
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
  return (
    <>
      {props.tokens.map((tok, i) => {
        if (tok.code) return <Text key={i}>{tok.text}</Text>;
        if (tok.bold) return <Text key={i} bold>{tok.text}</Text>;
        // Plain prose: linkify http(s) URLs + file paths (code/bold stay literal).
        return <LinkedText key={i} text={tok.text} />;
      })}
    </>
  );
}

function TableView(props: { block: Extract<Block, { type: "table" }> }): ReactElement {
  const { headers, rows, aligns } = props.block;
  // Bordered, aligned, wrap-wide lines (VANTA-MARKDOWN-TABLES). Line 1 = top rule,
  // lines 2..k = header rows, then the header rule, then data rows, then bottom.
  const lines = layoutTable(headers, rows, aligns);
  return (
    <Box flexDirection="column">
      {lines.map((l, i) => <Text key={i} bold={i >= 1 && i <= headers.length}>{l}</Text>)}
    </Box>
  );
}

/** A syntax-highlighted code line: keyword→accent, string→success, number→
 * warning, comment→dim, plain→primary. Two-space indent matches the block. */
function CodeLine(props: { line: string; lang: string }): ReactElement {
  const segs = highlightLine(props.line, props.lang);
  return <Text>{"  "}{segs.map((s, i) => <Seg key={i} seg={s} />)}</Text>;
}

function Seg(props: { seg: HlSeg }): ReactElement {
  const { seg } = props;
  if (seg.cls === "comment") return <Text>{seg.text}</Text>;
  const color = seg.cls === "keyword" ? "white" : seg.cls === "string" ? "white" : seg.cls === "number" ? "white" : "white";
  return <Text>{seg.text}</Text>;
}

function BlockView(props: { block: Block }): ReactElement {
  const b = props.block;
  if (b.type === "spacer") return <Text> </Text>;
  if (b.type === "code") return (
    <Box flexDirection="column">
      {b.lang ? <Text>{`  ${b.lang}`}</Text> : null}
      {b.lines.map((l, j) => <CodeLine key={j} line={l} lang={b.lang} />)}
    </Box>
  );
  if (b.type === "heading") return <Box marginTop={1}><Text bold>{"#".repeat(b.level)} <Inline tokens={tokenizeInline(b.text)} /></Text></Box>;
  if (b.type === "bullet") return <Text>{"  • "}<Inline tokens={tokenizeInline(b.text)} /></Text>;
  if (b.type === "numbered") return <Text>{`  ${b.n}. `}<Inline tokens={tokenizeInline(b.text)} /></Text>;
  if (b.type === "table") return <TableView block={b} />;
  return <Text><Inline tokens={tokenizeInline(b.text)} /></Text>;
}

export function Markdown(props: { text: string }): ReactElement {
  const blocks = parseBlocks(props.text);
  return (
    <Box flexDirection="column">
      {blocks.map((b, i) => <BlockView key={i} block={b} />)}
    </Box>
  );
}
