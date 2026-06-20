import * as ts from "typescript";
import { buildService } from "./ts-service.js";

/** A reference hit: 1-based line/col, plus the optional surrounding line text. */
export type Reference = {
  file: string;
  line: number;
  col: number;
  text?: string;
};

/** A document symbol: declared name, TS syntax-kind label, 1-based line. */
export type DocSymbol = { name: string; kind: string; line: number };

/** Hover (quick-info): the type/signature display plus optional doc comment. */
export type Hover = { display: string; docs?: string };

/**
 * Map raw `ts.ReferenceEntry[]` to the compact reference shape. Each entry is
 * resolved against its own source file (references may live in other files),
 * so a `getSource` lookup is injected rather than re-reading from disk. Entries
 * whose source can't be resolved are dropped (errors-as-values: no throw).
 */
export function mapReferences(
  entries: readonly ts.ReferenceEntry[],
  getSource: (fileName: string) => ts.SourceFile | undefined,
): Reference[] {
  const out: Reference[] = [];
  for (const entry of entries) {
    const source = getSource(entry.fileName);
    if (!source) continue;
    const { line, character } = source.getLineAndCharacterOfPosition(
      entry.textSpan.start,
    );
    out.push({
      file: entry.fileName,
      line: line + 1,
      col: character + 1,
      text: lineText(source, line),
    });
  }
  return out;
}

/** Extract the trimmed source text of a 0-based line, or undefined if empty. */
function lineText(source: ts.SourceFile, line: number): string | undefined {
  const full = source.getFullText();
  const start = source.getPositionOfLineAndCharacter(line, 0);
  let end = full.indexOf("\n", start);
  if (end === -1) end = full.length;
  const text = full.slice(start, end).trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Flatten a `ts.NavigationTree` (the document-symbol tree) into a flat list of
 * named symbols. The root node is the whole file ("<global>") and is skipped;
 * only named child declarations are emitted. Recurses one helper deep.
 */
export function mapSymbols(
  tree: ts.NavigationTree | undefined,
  getLine: (pos: number) => number,
): DocSymbol[] {
  if (!tree) return [];
  const out: DocSymbol[] = [];
  for (const child of tree.childItems ?? []) {
    collectSymbol(child, getLine, out);
  }
  return out;
}

function collectSymbol(
  node: ts.NavigationTree,
  getLine: (pos: number) => number,
  out: DocSymbol[],
): void {
  const span = node.spans[0];
  if (node.text && span) {
    out.push({
      name: node.text,
      kind: String(node.kind),
      line: getLine(span.start) + 1,
    });
  }
  for (const child of node.childItems ?? []) {
    collectSymbol(child, getLine, out);
  }
}

/**
 * Map a raw `ts.QuickInfo` (hover) to the compact hover shape, or null when the
 * service returned nothing (no symbol under the cursor). The display string is
 * the type/signature; docs are the joined documentation comment, if any.
 */
export function mapQuickInfo(info: ts.QuickInfo | undefined): Hover | null {
  if (!info) return null;
  const display = ts.displayPartsToString(info.displayParts);
  const docs = ts.displayPartsToString(info.documentation);
  return docs.length > 0 ? { display, docs } : { display };
}

/** Resolve a 1-based (line, col) to a flat offset in `source`, or -1 if invalid. */
function offsetAt(
  source: ts.SourceFile,
  line: number,
  col: number,
): number {
  try {
    return ts.getPositionOfLineAndCharacter(source, line - 1, col - 1);
  } catch {
    return -1;
  }
}

/**
 * Find all references to the symbol at a 1-based (line, col) in a .ts/.tsx file.
 * Returns an empty list for a bad path/position (errors-as-values).
 */
export function findReferences(
  filePath: string,
  line: number,
  col: number,
): Reference[] {
  const { service, fileName } = buildService(filePath);
  const program = service.getProgram();
  const source = program?.getSourceFile(fileName);
  if (!source) return [];
  const offset = offsetAt(source, line, col);
  if (offset < 0) return [];
  const entries = service.getReferencesAtPosition(fileName, offset) ?? [];
  return mapReferences(entries, (fn) => program?.getSourceFile(fn));
}

/**
 * List the document symbols (top-level + nested named declarations) of a
 * .ts/.tsx file. Empty list when the file can't be loaded (errors-as-values).
 */
export function documentSymbols(filePath: string): DocSymbol[] {
  const { service, fileName } = buildService(filePath);
  const source = service.getProgram()?.getSourceFile(fileName);
  if (!source) return [];
  const tree = service.getNavigationTree(fileName);
  return mapSymbols(tree, (pos) =>
    source.getLineAndCharacterOfPosition(pos).line,
  );
}

/**
 * Hover (quick-info) for the symbol at a 1-based (line, col). Returns null when
 * there is no symbol under the cursor or the file can't load (errors-as-values).
 */
export function hoverInfo(
  filePath: string,
  line: number,
  col: number,
): Hover | null {
  const { service, fileName } = buildService(filePath);
  const source = service.getProgram()?.getSourceFile(fileName);
  if (!source) return null;
  const offset = offsetAt(source, line, col);
  if (offset < 0) return null;
  return mapQuickInfo(service.getQuickInfoAtPosition(fileName, offset));
}
