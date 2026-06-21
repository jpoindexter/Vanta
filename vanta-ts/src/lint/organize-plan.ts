import { basename } from "node:path";
import * as ts from "typescript";
import { analyzeSource, LIMITS, type Limits } from "./size.js";

// ORGANIZE-CODE-TOOL — pure decomposition PLANNER for the size gate.
// Given an oversized file, propose which top-level declarations to extract
// into a new co-located module so the original drops under LIMITS.file, plus
// the re-export reminder that keeps callers unchanged. This PROPOSES only — it
// never moves code or writes a file. The actual extraction is the operator/
// agent's kernel-gated edit (named in formatOrganizePlan + the wiring note).
// Reuses analyzeSource/LIMITS as the size source of truth; mirrors clarify.ts
// (end-of-turn advisory output, no ToolContext mutation).

/** A top-level declaration the file owns, with its line span. */
export type TopLevelDecl = {
  name: string;
  kind: "function" | "class" | "const" | "interface" | "type" | "enum";
  lineCount: number;
};

/** Pure analysis of a file's decomposition surface. */
export type DecompositionAnalysis = {
  fileLines: number;
  overGate: boolean;
  limit: number;
  topLevelDecls: TopLevelDecl[];
};

/** One proposed extraction: move `symbolName` into `targetModule`, re-export. */
export type ExtractSuggestion = {
  symbolName: string;
  kind: TopLevelDecl["kind"];
  lineCount: number;
  targetModule: string;
};

function declName(node: ts.Node): string | undefined {
  const named = node as { name?: ts.Node };
  if (named.name && ts.isIdentifier(named.name)) return named.name.text;
  return undefined;
}

function classifyDecl(node: ts.Node): TopLevelDecl["kind"] | undefined {
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isVariableStatement(node)) return "const";
  return undefined;
}

/** The named decl node a VariableStatement wraps (first declaration), else the node itself. */
function namedNodeFor(node: ts.Node): ts.Node {
  if (ts.isVariableStatement(node)) return node.declarationList.declarations[0] ?? node;
  return node;
}

function lineSpan(sf: ts.SourceFile, node: ts.Node): number {
  const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
  const end = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
  return end - start + 1;
}

/** List a file's top-level declarations (with line counts) and flag if it's over
 *  the file-size gate. Pure — uses the TS compiler API like analyzeSource. */
export function analyzeDecomposition(
  filePath: string,
  source: string,
  limits: Limits = LIMITS,
): DecompositionAnalysis {
  const fileViolation = analyzeSource(filePath, source, limits).find((v) => v.kind === "file");
  const fileLines = source.trimEnd().split("\n").length;
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind);
  const topLevelDecls: TopLevelDecl[] = [];
  for (const stmt of sf.statements) {
    const kind = classifyDecl(stmt);
    if (!kind) continue;
    const name = declName(namedNodeFor(stmt));
    if (!name) continue;
    topLevelDecls.push({ name, kind, lineCount: lineSpan(sf, stmt) });
  }
  return {
    fileLines,
    overGate: fileViolation !== undefined,
    limit: limits.file,
    topLevelDecls,
  };
}

const KIND_GROUP: Record<TopLevelDecl["kind"], string> = {
  function: "fns",
  class: "class",
  const: "consts",
  interface: "types",
  type: "types",
  enum: "types",
};

/** Derive a co-located target module name for an extracted decl, e.g.
 *  `size.ts` + a fn → `size-fns.ts`. Deterministic from file + decl kind. */
function targetModuleFor(fileName: string, kind: TopLevelDecl["kind"]): string {
  const base = basename(fileName).replace(/\.tsx?$/, "");
  const ext = fileName.endsWith(".tsx") ? ".tsx" : ".ts";
  return `${base}-${KIND_GROUP[kind]}${ext}`;
}

/** Greedily pick the largest top-level decls to extract until the remaining
 *  file would be under LIMITS.file. Pure. Empty when not over the gate. */
export function planDecomposition(
  analysis: DecompositionAnalysis,
  fileName: string,
): ExtractSuggestion[] {
  if (!analysis.overGate) return [];
  const byLargest = [...analysis.topLevelDecls].sort((a, b) => b.lineCount - a.lineCount);
  const suggestions: ExtractSuggestion[] = [];
  let remaining = analysis.fileLines;
  for (const decl of byLargest) {
    if (remaining <= analysis.limit) break;
    suggestions.push({
      symbolName: decl.name,
      kind: decl.kind,
      lineCount: decl.lineCount,
      targetModule: targetModuleFor(fileName, decl.kind),
    });
    remaining -= decl.lineCount;
  }
  return suggestions;
}

/** Operator-facing plan text. Lists the extractions, the re-export reminder
 *  that keeps callers unchanged, and an explicit "no files changed" — this is
 *  a proposal; the extraction edit is the operator/agent's kernel-gated action. */
export function formatOrganizePlan(plan: ExtractSuggestion[], filePath: string): string {
  const first = plan[0];
  if (!first) {
    return `${filePath} is within the file-size gate — no decomposition needed.`;
  }
  const limit = LIMITS.file;
  const lines = [`Extract ${plan.length} decl(s) to get ${filePath} under ${limit} lines:`];
  for (const s of plan) {
    lines.push(`  • ${s.symbolName} (${s.kind}, ${s.lineCount} lines) → ${s.targetModule}`);
  }
  lines.push(`Then re-export each from the original (e.g. \`export * from "./${first.targetModule.replace(/\.tsx?$/, ".js")}"\`) so callers stay unchanged.`);
  lines.push("This is a plan only — no files changed. Apply the extraction as a kernel-gated edit.");
  return lines.join("\n");
}
