import { type ReactElement } from "react";
import { Box, Text } from "ink";

// Minimal markdown renderer for Ink terminal output.
// Handles: fenced code blocks, h1/h2/h3, bullet lists, numbered lists,
// inline **bold** and `code`. Italic skipped — too many false positives
// with tool output that uses * for bullets or emphasis markers.

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
    if (line.startsWith("```")) {
      const { block, end } = parseFencedCode(lines, i);
      blocks.push(block); i = end; continue;
    }
    const hm = line.match(/^(#{1,})\s+(.*)/);
    if (hm) { blocks.push({ type: "heading", level: Math.min(hm[1]!.length, 3) as 1 | 2 | 3, text: hm[2]! }); i++; continue; }
    const bm = line.match(/^[-*]\s+(.*)/);
    if (bm) { blocks.push({ type: "bullet", text: bm[1]! }); i++; continue; }
    const nm = line.match(/^(\d+)\.\s+(.*)/);
    if (nm) { blocks.push({ type: "numbered", n: Number(nm[1]), text: nm[2]! }); i++; continue; }
    if (line.trim() === "") { blocks.push({ type: "spacer" }); i++; continue; }
    blocks.push({ type: "paragraph", text: line });
    i++;
  }
  return blocks;
}

function InlineTokens({ tokens }: { tokens: InlineToken[] }): ReactElement {
  return (
    <>
      {tokens.map((t, i) => {
        if (t.code) return <Text key={i} color="green">{t.text}</Text>;
        if (t.bold) return <Text key={i} bold>{t.text}</Text>;
        return <Text key={i}>{t.text}</Text>;
      })}
    </>
  );
}

export function renderMarkdown(text: string): ReactElement {
  const blocks = parseBlocks(text);
  return (
    <Box flexDirection="column">
      {blocks.map((b, i) => {
        if (b.type === "spacer") return <Text key={i}> </Text>;
        if (b.type === "code") {
          return (
            <Box key={i} flexDirection="column">
              {b.lang ? <Text key="lang" dimColor>{`  ${b.lang}`}</Text> : null}
              {b.lines.map((l, j) => (
                <Text key={j} color="cyan">{`  ${l}`}</Text>
              ))}
            </Box>
          );
        }
        if (b.type === "heading") {
          const color = b.level === 1 ? "white" : b.level === 2 ? "cyan" : undefined;
          return (
            <Text key={i} bold color={color}>
              {"#".repeat(b.level) + " "}
              <InlineTokens tokens={tokenizeInline(b.text)} />
            </Text>
          );
        }
        if (b.type === "bullet") {
          return (
            <Text key={i}>
              {"  · "}
              <InlineTokens tokens={tokenizeInline(b.text)} />
            </Text>
          );
        }
        if (b.type === "numbered") {
          return (
            <Text key={i}>
              {`  ${b.n}. `}
              <InlineTokens tokens={tokenizeInline(b.text)} />
            </Text>
          );
        }
        return (
          <Text key={i}>
            <InlineTokens tokens={tokenizeInline(b.text)} />
          </Text>
        );
      })}
    </Box>
  );
}
