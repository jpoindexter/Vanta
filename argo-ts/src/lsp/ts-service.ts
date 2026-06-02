import { dirname } from "node:path";
import * as ts from "typescript";

export type Diagnostic = {
  line: number;
  character: number;
  message: string;
  category: "error" | "warning";
};

export type Definition = { file: string; line: number; character: number };

/** Reasonable defaults when no tsconfig is found; jsx keeps .tsx parseable. */
const DEFAULT_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.Latest,
  module: ts.ModuleKind.ESNext,
  strict: true,
  jsx: ts.JsxEmit.Preserve,
  allowJs: true,
};

/**
 * Build a LanguageServiceHost backed by `ts.sys` so lib.d.ts and imported
 * modules resolve from disk — a target-file-only host floods bogus globals.
 */
function makeHost(
  fileName: string,
  options: ts.CompilerOptions,
): ts.LanguageServiceHost {
  return {
    getScriptFileNames: () => [fileName],
    getScriptVersion: () => "1",
    getScriptSnapshot: (fn) => {
      const text = ts.sys.readFile(fn);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => dirname(fileName),
    getCompilationSettings: () => options,
    getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
}

/** Resolve compiler options from the nearest tsconfig, else the defaults. */
function resolveOptions(filePath: string): ts.CompilerOptions {
  const configPath = ts.findConfigFile(dirname(filePath), ts.sys.fileExists);
  if (!configPath) return DEFAULT_OPTIONS;
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error || !read.config) return DEFAULT_OPTIONS;
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    dirname(configPath),
  );
  return parsed.options;
}

function buildService(filePath: string): {
  service: ts.LanguageService;
  fileName: string;
} {
  const fileName = ts.sys.resolvePath(filePath);
  const options = resolveOptions(fileName);
  const service = ts.createLanguageService(
    makeHost(fileName, options),
    ts.createDocumentRegistry(),
  );
  return { service, fileName };
}

function mapDiagnostic(d: ts.Diagnostic): Diagnostic | undefined {
  if (d.file === undefined || d.start === undefined) return undefined;
  const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
  return {
    line: line + 1,
    character: character + 1,
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    category:
      d.category === ts.DiagnosticCategory.Error ? "error" : "warning",
  };
}

/** Semantic + syntactic diagnostics for a single .ts/.tsx file. */
export function getDiagnostics(filePath: string): Diagnostic[] {
  const { service, fileName } = buildService(filePath);
  const raw = [
    ...service.getSyntacticDiagnostics(fileName),
    ...service.getSemanticDiagnostics(fileName),
  ];
  const out: Diagnostic[] = [];
  for (const d of raw) {
    const mapped = mapDiagnostic(d);
    if (mapped) out.push(mapped);
  }
  return out;
}

/**
 * Go-to-definition at a 1-based (line, character). Definitions may live in
 * other files, so each span is mapped back through its own source file.
 */
export function getDefinition(
  filePath: string,
  line: number,
  character: number,
): Definition[] {
  const { service, fileName } = buildService(filePath);
  const program = service.getProgram();
  const source = program?.getSourceFile(fileName);
  if (!source) return [];
  const offset = ts.getPositionOfLineAndCharacter(
    source,
    line - 1,
    character - 1,
  );
  const defs = service.getDefinitionAtPosition(fileName, offset) ?? [];
  const out: Definition[] = [];
  for (const def of defs) {
    const defSource = program?.getSourceFile(def.fileName);
    if (!defSource) continue;
    const pos = defSource.getLineAndCharacterOfPosition(def.textSpan.start);
    out.push({
      file: def.fileName,
      line: pos.line + 1,
      character: pos.character + 1,
    });
  }
  return out;
}
