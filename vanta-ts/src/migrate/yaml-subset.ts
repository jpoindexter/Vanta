// A deliberately small YAML reader for the two sections of a source agent's
// config.yaml that migration needs (a model block and an MCP server map). It reads
// block maps, block lists, flow lists of scalars, `{}` / `[]`, comments and quoted
// scalars, and REFUSES everything else (anchors, tags, block scalars, flow maps
// with content, list-of-maps, tab indentation) with the line number. Refusing
// instead of guessing means an exotic entry is reported and skipped, never
// half-imported. No dependency: the repo has no YAML library and this is not worth one.

export type YamlNode = string | YamlNode[] | { [key: string]: YamlNode };
export type YamlLine = { indent: number; text: string; no: number; tabbed: boolean };

export class YamlSubsetError extends Error {
  constructor(readonly line: number, message: string) {
    super(`line ${line}: ${message}`);
  }
}

/** Stateful scanner: true when the char at `i` is an opening quote, quoted text or a closing quote. */
function quoteScanner(): (text: string, i: number) => boolean {
  let quote = "";
  let escaped = false;
  return (text, i) => {
    const ch = text[i]!;
    if (escaped) { escaped = false; return true; }
    if (quote) {
      if (ch === "\\" && quote === '"') escaped = true;
      else if (ch === quote) quote = "";
      return true;
    }
    if (ch !== '"' && ch !== "'") return false;
    quote = ch;
    return true;
  };
}

/** Remove a trailing ` # comment` that sits outside quotes. */
function stripComment(raw: string): string {
  const inQuote = quoteScanner();
  for (let i = 0; i < raw.length; i++) {
    if (!inQuote(raw, i) && raw[i] === "#" && (i === 0 || /\s/.test(raw[i - 1]!))) return raw.slice(0, i);
  }
  return raw;
}

/** Meaningful lines (blank and comment-only dropped) with indent and 1-based number. */
export function toYamlLines(text: string): YamlLine[] {
  const out: YamlLine[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const body = stripComment(raw).replace(/\s+$/, "");
    if (!body.trim() || body.trim() === "---") return;
    const lead = /^[ \t]*/.exec(body)![0];
    // A tab only matters if the line lands inside a section we parse; other sections are never read.
    out.push({ indent: lead.length, text: body.slice(lead.length), no: i + 1, tabbed: lead.includes("\t") });
  });
  return out;
}

function unquote(value: string, no: number): string {
  if (value.startsWith('"')) {
    if (!value.endsWith('"') || value.length < 2) throw new YamlSubsetError(no, "unterminated double-quoted string");
    return value.slice(1, -1).replace(/\\(["\\nt])/g, (_m, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) throw new YamlSubsetError(no, "unterminated single-quoted string");
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function scalar(value: string, no: number): string {
  if (/^[&*!|>]/.test(value)) throw new YamlSubsetError(no, `"${value[0]}" (anchor, alias, tag or block scalar) is not supported`);
  if (value === "~" || value === "null") return "";
  return unquote(value, no);
}

function splitFlow(inner: string, no: number): string[] {
  const inQuote = quoteScanner();
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (inQuote(inner, i)) current += ch;
    else if (ch === "[" || ch === "{") throw new YamlSubsetError(no, "nested flow collections are not supported");
    else if (ch === ",") { parts.push(current.trim()); current = ""; }
    else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function inlineValue(value: string, no: number): YamlNode {
  if (value === "{}") return {};
  if (value === "[]") return [];
  if (value.startsWith("{")) throw new YamlSubsetError(no, "flow maps with content are not supported");
  if (value.startsWith("[")) {
    if (!value.endsWith("]")) throw new YamlSubsetError(no, "multi-line flow list is not supported");
    return splitFlow(value.slice(1, -1), no).map((item) => scalar(item, no));
  }
  return scalar(value, no);
}

/** Split `key: value` at the first colon outside quotes that is followed by space or end. */
function splitKey(text: string, no: number): { key: string; rest: string } {
  const inQuote = quoteScanner();
  for (let i = 0; i < text.length; i++) {
    if (inQuote(text, i) || text[i] !== ":" || (i < text.length - 1 && text[i + 1] !== " ")) continue;
    return { key: unquote(text.slice(0, i).trim(), no), rest: text.slice(i + 1).trim() };
  }
  throw new YamlSubsetError(no, `expected "key: value", got "${text.slice(0, 40)}"`);
}

const isItem = (line: YamlLine): boolean => line.text === "-" || line.text.startsWith("- ");

function parseList(lines: YamlLine[], start: number, indent: number): [YamlNode[], number] {
  const items: YamlNode[] = [];
  let i = start;
  while (i < lines.length && lines[i]!.indent === indent && isItem(lines[i]!)) {
    const { text, no } = lines[i]!;
    if (lines[i]!.tabbed) throw new YamlSubsetError(no, "tab indentation is not supported");
    const body = text.slice(1).trim();
    if (!body || /^[^"'\s][^"']*:(\s|$)/.test(body)) throw new YamlSubsetError(no, "list items must be plain scalars");
    items.push(inlineValue(body, no));
    i++;
  }
  return [items, i];
}

function parseMap(lines: YamlLine[], start: number, indent: number): [{ [key: string]: YamlNode }, number] {
  const out: { [key: string]: YamlNode } = {};
  let i = start;
  while (i < lines.length && lines[i]!.indent === indent && !isItem(lines[i]!)) {
    const { text, no } = lines[i]!;
    if (lines[i]!.tabbed) throw new YamlSubsetError(no, "tab indentation is not supported");
    const { key, rest } = splitKey(text, no);
    i++;
    if (rest) { out[key] = inlineValue(rest, no); continue; }
    const next = lines[i];
    if (next && (next.indent > indent || (next.indent === indent && isItem(next)))) {
      const [node, after] = parseNode(lines, i);
      out[key] = node;
      i = after;
    } else out[key] = "";
  }
  return [out, i];
}

function parseNode(lines: YamlLine[], start: number): [YamlNode, number] {
  const first = lines[start]!;
  return isItem(first) ? parseList(lines, start, first.indent) : parseMap(lines, start, first.indent);
}

/** Parse a block of lines (one value). Throws YamlSubsetError on unsupported syntax. */
export function parseYamlBlock(lines: YamlLine[]): YamlNode {
  if (!lines.length) return "";
  const [node, end] = parseNode(lines, 0);
  if (end < lines.length) throw new YamlSubsetError(lines[end]!.no, "unexpected indentation");
  return node;
}

export type YamlSection = { kind: "absent" } | { kind: "inline"; value: string } | { kind: "block"; lines: YamlLine[] };

/** The value of a top-level `key:` — inline scalar or the lines nested under it. */
export function readSection(lines: YamlLine[], key: string): YamlSection {
  const at = lines.findIndex((l) => l.indent === 0 && !isItem(l) && new RegExp(`^["']?${key}["']?:(\\s|$)`).test(l.text));
  if (at < 0) return { kind: "absent" };
  const head = lines[at]!;
  const { rest } = splitKey(head.text, head.no);
  if (rest) return { kind: "inline", value: scalar(rest, head.no) };
  let end = at + 1;
  while (end < lines.length && (lines[end]!.indent > 0 || isItem(lines[end]!))) end++;
  return { kind: "block", lines: lines.slice(at + 1, end) };
}

/** Group a block of `name:` entries into one line-slice per entry (the first line's indent is the key level). */
export function splitEntries(lines: YamlLine[]): Array<{ name: string; no: number; lines: YamlLine[] }> {
  if (!lines.length) return [];
  const level = lines[0]!.indent;
  const entries: Array<{ name: string; no: number; lines: YamlLine[] }> = [];
  for (const line of lines) {
    if (line.indent === level && !isItem(line)) {
      const { key } = splitKey(line.text, line.no);
      entries.push({ name: key, no: line.no, lines: [line] });
    } else entries.at(-1)?.lines.push(line);
  }
  return entries;
}
