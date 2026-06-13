import { type ReactElement } from "react";
import { Box, Text } from "ink";
import { useTheme, type Theme } from "./theme.js";

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
  | { type: "spacer" };

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

function BlockView(props: { block: Block; theme: Theme }): ReactElement {
  const b = props.block;
  const t = props.theme;
  if (b.type === "spacer") return <Text> </Text>;
  if (b.type === "code") return (
    <Box flexDirection="column">
      {b.lang ? <Text dimColor={t.dimText}>{`  ${b.lang}`}</Text> : null}
      {b.lines.map((l, j) => <Text key={j} color={t.info}>{`  ${l}`}</Text>)}
    </Box>
  );
  if (b.type === "heading") return <Text bold color={t.accent}>{"#".repeat(b.level)} <Inline tokens={tokenizeInline(b.text)} /></Text>;
  if (b.type === "bullet") return <Text>{"  • "}<Inline tokens={tokenizeInline(b.text)} /></Text>;
  if (b.type === "numbered") return <Text>{`  ${b.n}. `}<Inline tokens={tokenizeInline(b.text)} /></Text>;
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
