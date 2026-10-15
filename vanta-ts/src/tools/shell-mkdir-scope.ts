import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { canonicalPath, expandHome, isDangerousPath } from "./writable-zones.js";

type SimpleWord = { value: string; quote: "bare" | "single" | "double" };

const UNSAFE_BARE = /["'|`<>()[\]{}*?]/;

function nextWord(input: string, start: number): { word: SimpleWord; next: number } | null {
  const quote = input[start] === "'" ? "single" : input[start] === '"' ? "double" : "bare";
  if (quote !== "bare") {
    const end = input.indexOf(quote === "single" ? "'" : '"', start + 1);
    if (end < 0) return null;
    const value = input.slice(start + 1, end);
    if (quote === "double" && (value.includes("\\") || value.includes("`"))) return null;
    return { word: { value, quote }, next: end + 1 };
  }
  let end = start;
  while (end < input.length && !/\s/.test(input[end]!) && input[end] !== ";" && input[end] !== "&") end += 1;
  const value = input.slice(start, end);
  if (!value || UNSAFE_BARE.test(value)) return null;
  return { word: { value, quote }, next: end };
}

/** Parse only a direct, simple mkdir prefix. Any unsupported shell grammar returns null. */
function directMkdirWords(command: string): SimpleWord[] | null {
  const head = /^\s*mkdir\b/.exec(command);
  if (!head) return null;
  const words: SimpleWord[] = [];
  let cursor = head[0].length;
  while (cursor < command.length) {
    while (/\s/.test(command[cursor] ?? "")) cursor += 1;
    if (cursor >= command.length || command.startsWith("&&", cursor) || command[cursor] === ";") break;
    if (command[cursor] === "&") return null;
    const parsed = nextWord(command, cursor);
    if (!parsed) return null;
    words.push(parsed.word);
    cursor = parsed.next;
  }
  return words;
}

function resolveWord(word: SimpleWord, cwd: string, env: NodeJS.ProcessEnv): string | null {
  let value = word.value;
  if (word.quote !== "single") {
    const home = env.HOME || homedir();
    if (value === "$HOME" || value === "${HOME}") value = home;
    else if (value.startsWith("$HOME/")) {
      const suffix = value.slice(6);
      if (suffix.includes("$")) return null;
      value = resolve(home, suffix);
    } else if (value.startsWith("${HOME}/")) {
      const suffix = value.slice(8);
      if (suffix.includes("$")) return null;
      value = resolve(home, suffix);
    }
    else if (value.includes("$")) return null;
    else if (word.quote === "bare") value = expandHome(value);
  }
  if (!value) return null;
  const target = canonicalPath(resolve(cwd, value));
  return isDangerousPath(target).dangerous ? null : target;
}

/** Every target of a simple direct mkdir, including multiple $HOME paths. */
export function directMkdirTargets(command: string, cwd: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const words = directMkdirWords(command);
  if (!words) return [];
  const separator = words.findIndex((word) => word.value === "--");
  const candidates = words.filter((word, index) => separator >= 0 ? index > separator : !word.value.startsWith("-"));
  const targets = candidates.map((word) => resolveWord(word, cwd, env));
  return targets.length > 0 && targets.every((target): target is string => target !== null) ? [...new Set(targets)] : [];
}

export function directMkdirTarget(command: string, cwd: string): string | null {
  const targets = directMkdirTargets(command, cwd);
  return targets.length === 1 ? targets[0]! : null;
}

export function externalDirectMkdirTargets(command: string, cwd: string, root: string): string[] {
  const canonicalRoot = canonicalPath(resolve(root));
  return directMkdirTargets(command, cwd).filter((target) => {
    const fromRoot = relative(canonicalRoot, target);
    return fromRoot.startsWith("..") || isAbsolute(fromRoot);
  });
}

export function externalDirectMkdirTarget(command: string, cwd: string, root: string): string | null {
  const targets = externalDirectMkdirTargets(command, cwd, root);
  return targets.length === 1 ? targets[0]! : null;
}

export function approvedMkdirWritableDirs(command: string, cwd: string): string[] {
  const parents = directMkdirTargets(command, cwd).map((target) => {
    let parent = dirname(target);
    while (!existsSync(parent)) {
      const next = dirname(parent);
      if (next === parent) return null;
      parent = next;
    }
    return canonicalPath(parent);
  });
  return [...new Set(parents.filter((parent): parent is string => parent !== null))];
}

export function resolvedMkdirSafetySuffix(command: string, cwd: string): string {
  const targets = directMkdirTargets(command, cwd);
  if (targets.length === 0) return "";
  const label = targets.length === 1 ? "target" : "targets";
  return ` (resolved mkdir ${label}: ${targets.join(", ")})`;
}
