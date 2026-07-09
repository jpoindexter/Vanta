import { createRequire } from "node:module";
import { Language, Parser, type Node } from "web-tree-sitter";
import { classifyBashSafety, type BashSafety } from "./bash-classifier.js";

const require = createRequire(import.meta.url);

const TRUTHY = new Set(["1", "true", "on", "yes"]);

const RISKY_COMMANDS = new Set([
  "sudo", "doas", "rm", "rmdir", "mv", "cp", "dd", "chmod", "chown", "chgrp", "ln",
  "kill", "pkill", "killall", "curl", "wget", "nc", "ncat", "socat", "telnet", "ssh",
  "scp", "rsync", "tee", "truncate", "mkfifo", "shutdown", "reboot", "mount", "eval",
  "exec", "source", "export", "set", "trap", "nohup", "xargs", "crontab",
]);

const SAFE_HEADS = new Set([
  "ls", "pwd", "echo", "cat", "head", "tail", "wc", "which", "type", "env", "printenv",
  "date", "whoami", "hostname", "uname", "stat", "file", "du", "df", "basename", "dirname",
  "realpath", "true", "false", "grep", "rg", "find", "tree", "id", "groups", "uptime", "git",
]);

const GIT_SAFE_SUB = new Set(["status", "diff", "log", "show", "rev-parse", "ls-files", "describe", "blame", "shortlog"]);
const DANGEROUS_TARGET = /(\/etc\/|\/private\/etc\/|\/proc\/|\/sys\/|\.ssh\b|\.aws\b|\.gnupg\b|id_rsa|id_ed25519|\.env\b|credentials|google-tokens|\.codex\b|\.claude\b|\bshadow\b|authorized_keys)/i;
const SHELL_CONTROL_NODES = new Set([
  "command_substitution",
  "process_substitution",
  "pipeline",
  "list",
  "redirected_statement",
  "file_redirect",
  "heredoc_redirect",
  "herestring_redirect",
  "subshell",
  "if_statement",
  "for_statement",
  "while_statement",
  "case_statement",
  "function_definition",
  "declaration_command",
]);

export type TreeSitterBashResult = {
  safety: BashSafety;
  risks: string[];
  tree: string;
};

let parserReady: Promise<Language> | null = null;

export function treeSitterBashEnabled(env: NodeJS.ProcessEnv): boolean {
  return truthy(env.TREE_SITTER_BASH);
}

export function treeSitterBashShadowEnabled(env: NodeJS.ProcessEnv): boolean {
  return truthy(env.TREE_SITTER_BASH_SHADOW);
}

export async function classifyBashSafetyAsync(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  log: (line: string) => void = console.error,
): Promise<BashSafety> {
  const regexSafety = classifyBashSafety(command);
  const useTreeSitter = treeSitterBashEnabled(env);
  const shadow = treeSitterBashShadowEnabled(env);
  if (!useTreeSitter && !shadow) return regexSafety;

  const parsed = await classifyBashSafetyTreeSitter(command).catch((err: unknown): TreeSitterBashResult => ({
    safety: "unknown",
    risks: [`parser-unavailable:${err instanceof Error ? err.message : String(err)}`],
    tree: "",
  }));
  if (shadow && parsed.safety !== regexSafety) {
    log(`TREE_SITTER_BASH_SHADOW discrepancy: regex=${regexSafety} tree=${parsed.safety} risks=${parsed.risks.join(",") || "none"} command=${JSON.stringify(command)}`);
  }
  return useTreeSitter ? parsed.safety : regexSafety;
}

export async function classifyBashSafetyTreeSitter(command: string): Promise<TreeSitterBashResult> {
  const source = command.trim();
  if (!source) return result("unknown", ["empty"], "");

  const language = await loadBashLanguage();
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(source);
  try {
    if (!tree) return result("unknown", ["parse-null"], "");
    const root = tree.rootNode;
    const treeText = root.toString();
    const risks = collectRisks(root, source);
    if (root.hasError) risks.push("parse-error");
    if (DANGEROUS_TARGET.test(source)) risks.push("sensitive-target");
    const top = topLevelCommand(root);
    if (!top) risks.push("no-simple-command");
    else risks.push(...commandRisks(top, source));
    return result(risks.length ? "unknown" : "safe", risks, treeText);
  } finally {
    tree?.delete();
    parser.delete();
  }
}

async function loadBashLanguage(): Promise<Language> {
  parserReady ??= (async () => {
    await Parser.init();
    return Language.load(require.resolve("tree-sitter-bash/tree-sitter-bash.wasm"));
  })();
  return parserReady;
}

function collectRisks(node: Node, source: string): string[] {
  const risks: string[] = [];
  visit(node, (n) => {
    if (SHELL_CONTROL_NODES.has(n.type)) risks.push(n.type);
    if (n.type === "command") {
      const name = commandName(n);
      if (name && RISKY_COMMANDS.has(name.toLowerCase())) risks.push(`risky-command:${name}`);
    }
    if (n.type === "word" && DANGEROUS_TARGET.test(source.slice(n.startIndex, n.endIndex))) {
      risks.push("sensitive-target");
    }
  });
  return dedupe(risks);
}

function commandRisks(commandNode: Node, source: string): string[] {
  const name = commandName(commandNode)?.toLowerCase() ?? "";
  const args = commandArgs(commandNode);
  const risks: string[] = [];
  if (!SAFE_HEADS.has(name)) risks.push(`unknown-head:${name || "missing"}`);
  if (name === "git" && !GIT_SAFE_SUB.has((args[0] ?? "").toLowerCase())) risks.push("git-mutating-or-unknown");
  if (name === "find") {
    const text = source.slice(commandNode.startIndex, commandNode.endIndex);
    if (/(^|\s)-\s*(exec|execdir|delete|ok|okdir|fprint|fls)\b/i.test(text)) risks.push("find-action");
  }
  return risks;
}

function topLevelCommand(root: Node): Node | null {
  for (const child of root.namedChildren) {
    if (child.type === "command") return child;
  }
  return null;
}

function commandName(commandNode: Node): string | null {
  return commandNode.childForFieldName("name")?.text ?? null;
}

function commandArgs(commandNode: Node): string[] {
  const args: string[] = [];
  for (let i = 0; i < commandNode.childCount; i++) {
    const child = commandNode.child(i);
    if (child && commandNode.fieldNameForChild(i) === "argument") args.push(child.text);
  }
  return args;
}

function visit(node: Node, fn: (node: Node) => void): void {
  fn(node);
  for (const child of node.namedChildren) visit(child, fn);
}

function result(safety: BashSafety, risks: string[], tree: string): TreeSitterBashResult {
  return { safety, risks: dedupe(risks), tree };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function truthy(value: string | undefined): boolean {
  return TRUTHY.has((value ?? "").trim().toLowerCase());
}
