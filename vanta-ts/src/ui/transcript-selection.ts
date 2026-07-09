import type { Entry, ToolEntry } from "./types.js";

export type TranscriptSelection = { anchor: number; cursor: number };
export type TranscriptKey = {
  shift?: boolean;
  ctrl?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
};

export type TranscriptSelectionResult =
  | { kind: "none" }
  | { kind: "move"; selection: TranscriptSelection | null }
  | { kind: "copy"; text: string; selection: TranscriptSelection | null }
  | { kind: "clear" };

export function entryPlainText(entry: Entry): string {
  if (entry.kind === "user" || entry.kind === "assistant" || entry.kind === "note" || entry.kind === "thinking") return entry.text;
  if (entry.kind === "toolGroup") return entry.tools.map(toolPlainText).join("\n");
  return toolPlainText(entry);
}

function toolPlainText(entry: ToolEntry): string {
  const head = `${entry.verb}${entry.detail ? `(${entry.detail})` : ""}`;
  const meta = entry.ok === false ? entry.errorLine : entry.summary;
  return meta ? `${head}\n  ${meta}` : head;
}

export function transcriptPlainText(entries: readonly Entry[]): string {
  return entries.map(entryPlainText).filter(Boolean).join("\n\n");
}

export function orderedSelection(selection: TranscriptSelection): { start: number; end: number } {
  return {
    start: Math.min(selection.anchor, selection.cursor),
    end: Math.max(selection.anchor, selection.cursor),
  };
}

export function selectedTranscriptText(entries: readonly Entry[], selection: TranscriptSelection | null): string {
  if (!selection) return "";
  const text = transcriptPlainText(entries);
  const { start, end } = orderedSelection(clampSelection(selection, text.length));
  return start === end ? "" : text.slice(start, end);
}

export function handleTranscriptSelectionKey(
  entries: readonly Entry[],
  selection: TranscriptSelection | null,
  input: string,
  key: TranscriptKey,
): TranscriptSelectionResult {
  const text = transcriptPlainText(entries);
  if (!text) return { kind: "none" };
  if (key.ctrl && input === "c" && selectedTranscriptText(entries, selection)) {
    return { kind: "copy", text: selectedTranscriptText(entries, selection), selection: null };
  }
  if (key.shift && (key.leftArrow || key.rightArrow || key.upArrow || key.downArrow)) {
    return { kind: "move", selection: extendTranscriptSelection(text, selection, key) };
  }
  return selection && isClearingKeystroke(input, key) ? { kind: "clear" } : { kind: "none" };
}

export function extendTranscriptSelection(
  text: string,
  selection: TranscriptSelection | null,
  key: TranscriptKey,
): TranscriptSelection | null {
  const start = selection ? clampSelection(selection, text.length) : { anchor: text.length, cursor: text.length };
  const next = moveCursor(text, start.cursor, key);
  const out = { anchor: start.anchor, cursor: next };
  const ordered = orderedSelection(out);
  return ordered.start === ordered.end ? null : out;
}

export function renderSelectionPreview(text: string, selection: TranscriptSelection): Array<{ text: string; selected: boolean }> {
  const { start, end } = orderedSelection(clampSelection(selection, text.length));
  if (start === end) return [{ text, selected: false }];
  return [
    text.slice(0, start) && { text: text.slice(0, start), selected: false },
    { text: text.slice(start, end), selected: true },
    text.slice(end) && { text: text.slice(end), selected: false },
  ].filter(Boolean) as Array<{ text: string; selected: boolean }>;
}

function moveCursor(text: string, cursor: number, key: TranscriptKey): number {
  if (key.leftArrow) return Math.max(0, cursor - 1);
  if (key.rightArrow) return Math.min(text.length, cursor + 1);
  if (key.upArrow) return moveVertical(text, cursor, -1);
  if (key.downArrow) return moveVertical(text, cursor, 1);
  return cursor;
}

function moveVertical(text: string, cursor: number, dir: -1 | 1): number {
  const lines = splitLineStarts(text);
  const line = lineIndexFor(lines, cursor);
  const col = cursor - lines[line]!;
  const nextLine = Math.max(0, Math.min(lines.length - 1, line + dir));
  const lineEnd = nextLine === lines.length - 1 ? text.length : Math.max(lines[nextLine]!, lines[nextLine + 1]! - 1);
  return Math.min(lines[nextLine]! + col, lineEnd);
}

function splitLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return starts;
}

function lineIndexFor(starts: readonly number[], cursor: number): number {
  let line = 0;
  for (let i = 1; i < starts.length; i++) {
    if (starts[i]! > cursor) break;
    line = i;
  }
  return line;
}

function clampSelection(selection: TranscriptSelection, length: number): TranscriptSelection {
  return {
    anchor: Math.max(0, Math.min(length, selection.anchor)),
    cursor: Math.max(0, Math.min(length, selection.cursor)),
  };
}

function isClearingKeystroke(input: string, key: TranscriptKey): boolean {
  if (key.shift || key.ctrl) return false;
  return Boolean(input) || Boolean(key.leftArrow || key.rightArrow || key.upArrow || key.downArrow);
}
