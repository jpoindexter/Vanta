import * as ts from "typescript";

// AST-based TypeScript code compressor. Elides function/method bodies while
// preserving imports, type declarations, and signatures. The result is a
// structural skeleton: enough for the agent to understand the shape and decide
// whether it needs the full text (retrieved via CCR).

const MIN_BODY_LINES = 4;

// Match common TS/JS module patterns: import or export at the start of a line.
const TS_HINT = /^(?:import|export)\s+(?:type\s+)?(?:{|\*|default|\w)/m;

const FUNCTION_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.Constructor,
]);

function isFunctionLike(node: ts.Node): boolean {
  return FUNCTION_KINDS.has(node.kind);
}

/** Heuristic: true when the text looks like TypeScript/JavaScript source. Pure. */
export function isCodeContent(text: string): boolean {
  return TS_HINT.test(text);
}

type BodyRange = { start: number; end: number; lines: number };

function lineSpan(node: ts.Node, sf: ts.SourceFile): number {
  const s = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  const e = sf.getLineAndCharacterOfPosition(node.getEnd());
  return e.line - s.line + 1;
}

function collectBodies(sf: ts.SourceFile): BodyRange[] {
  const ranges: BodyRange[] = [];
  function visit(node: ts.Node): void {
    if (isFunctionLike(node) && "body" in node && node.body && ts.isBlock(node.body as ts.Node)) {
      const body = node.body as ts.Block;
      const lines = lineSpan(body, sf);
      if (lines >= MIN_BODY_LINES) {
        ranges.push({ start: body.getStart(sf), end: body.getEnd(), lines });
      }
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(sf, visit);
  return ranges;
}

/**
 * Elide function/method bodies from TypeScript/JavaScript source. Bodies with
 * fewer than MIN_BODY_LINES lines are kept as-is. Pure — no I/O.
 * Returns the original string when nothing was elided.
 */
export function compressTypeScript(source: string): string {
  const sf = ts.createSourceFile("_.ts", source, ts.ScriptTarget.Latest, true);
  const bodies = collectBodies(sf);
  if (!bodies.length) return source;
  let out = "";
  let pos = 0;
  for (const b of bodies) {
    out += source.slice(pos, b.start);
    out += `{ /* …${b.lines} lines */ }`;
    pos = b.end;
  }
  out += source.slice(pos);
  return out;
}
