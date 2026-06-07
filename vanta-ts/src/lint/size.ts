import * as ts from "typescript";

// CODE-SIZE-GATE — industry-standard size limits, always on. Extends the
// factory's born-small file check (verifier.ts) to functions, parameters, and
// cyclomatic complexity, via the TS compiler API (accurate, no regex guessing).
// Pure: analyzeSource takes file text → violations. The CLI + factory + the
// pre-commit warn all read this one source of truth. Mirrors the
// enforcing-code-size skill.

export const LIMITS = { file: 300, func: 50, params: 4, complexity: 10 } as const;
export type Limits = typeof LIMITS;

export type Violation = {
  file: string;
  line: number;
  kind: "file" | "function" | "params" | "complexity";
  actual: number;
  limit: number;
  name?: string;
  fix: string;
};

function isFunctionLike(n: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isMethodDeclaration(n) ||
    ts.isArrowFunction(n) ||
    ts.isFunctionExpression(n) ||
    ts.isConstructorDeclaration(n) ||
    ts.isGetAccessorDeclaration(n) ||
    ts.isSetAccessorDeclaration(n)
  );
}

function funcName(n: ts.Node): string {
  const named = n as { name?: ts.Node };
  if (named.name && ts.isIdentifier(named.name)) return named.name.text;
  if (ts.isConstructorDeclaration(n)) return "constructor";
  return "(anonymous)";
}

// A decision point adds 1 to cyclomatic complexity. Short-circuit/null-coalesce
// operators count too. Kept as lookup sets so the walker stays flat + low-cx.
const DECISION_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.IfStatement, ts.SyntaxKind.ForStatement, ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement, ts.SyntaxKind.WhileStatement, ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause, ts.SyntaxKind.CatchClause, ts.SyntaxKind.ConditionalExpression,
]);
const SHORT_CIRCUIT = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken,
]);

function isDecision(n: ts.Node): boolean {
  if (DECISION_KINDS.has(n.kind)) return true;
  return ts.isBinaryExpression(n) && SHORT_CIRCUIT.has(n.operatorToken.kind);
}

/** Cyclomatic complexity within a function body, not descending into nested
 *  functions (those are counted on their own). Base 1 + each decision point. */
function complexity(fn: ts.Node): number {
  let count = 1;
  const walk = (n: ts.Node): void => {
    if (n !== fn && isFunctionLike(n)) return; // nested fn scored separately
    if (isDecision(n)) count++;
    ts.forEachChild(n, walk);
  };
  walk(fn);
  return count;
}

/** Analyze one source file for size violations. Pure. */
export function analyzeSource(file: string, content: string, limits: Limits = LIMITS): Violation[] {
  const out: Violation[] = [];
  const fileLines = content.trimEnd().split("\n").length;
  if (fileLines > limits.file) {
    out.push({ file, line: 1, kind: "file", actual: fileLines, limit: limits.file, fix: "split into smaller modules" });
  }
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, kind);
  const visit = (node: ts.Node): void => {
    if (isFunctionLike(node)) {
      const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
      const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
      const len = end - start + 1;
      const name = funcName(node);
      const line = start + 1;
      if (len > limits.func) out.push({ file, line, kind: "function", actual: len, limit: limits.func, name, fix: "extract helpers" });
      const params = (node as ts.SignatureDeclaration).parameters?.length ?? 0;
      if (params > limits.params) out.push({ file, line, kind: "params", actual: params, limit: limits.params, name, fix: "use an options object" });
      const cx = complexity(node);
      if (cx > limits.complexity) out.push({ file, line, kind: "complexity", actual: cx, limit: limits.complexity, name, fix: "reduce branching / extract" });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Format a violation as a clickable `file:line` line with the limit + fix. */
export function formatViolation(v: Violation): string {
  const who = v.name ? ` ${v.name}` : "";
  return `  ${v.file}:${v.line}  ${v.kind}${who} ${v.actual} > ${v.limit} — ${v.fix}`;
}
