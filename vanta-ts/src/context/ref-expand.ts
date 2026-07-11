import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { assertPublicUrl } from "../net/ssrf-guard.js";
import { extractReadable } from "../tools/web-fetch.js";

export const MAX_REF_CHARS = 20_000;
export const MAX_CONTEXT_CHARS = 60_000;
const MAX_FOLDER_FILES = 200;
const MAX_REDIRECTS = 5;
const run = promisify(execFile);

export type ContextRef =
  | { raw: string; kind: "file"; value: string; range?: [number, number] }
  | { raw: string; kind: "folder"; value: string }
  | { raw: string; kind: "url"; value: string }
  | { raw: string; kind: "diff" }
  | { raw: string; kind: "staged" }
  | { raw: string; kind: "git"; count: number };

export type ExpandDeps = {
  git?: (args: string[]) => Promise<string>;
  fetchUrl?: (url: string) => Promise<string>;
  maxRefChars?: number;
  maxTotalChars?: number;
};

export type ExpandResult = { block: string; expanded: string[]; warnings: string[] };

const TOKEN_RE = /(^|\s)(@(url:https?:\/\/\S+|file:\S+|folder:\S+|git:\d+|diff\b|staged\b|[\w./-]+))/g;
const SENSITIVE_RE = /(^|\/)(\.env(?:\.|$)|credentials?|secrets?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$))/i;

/** Parse explicit v2 references while preserving the shipped legacy `@path` form. */
export function parseContextRefs(input: string): ContextRef[] {
  return [...input.matchAll(TOKEN_RE)].flatMap((match) => {
    const raw = trimToken(match[2]!);
    return parseToken(raw);
  });
}

function trimToken(raw: string): string {
  return raw.replace(/[),.;]+$/, "");
}

function parseToken(raw: string): ContextRef[] {
  if (raw === "@diff") return [{ raw, kind: "diff" }];
  if (raw === "@staged") return [{ raw, kind: "staged" }];
  if (raw.startsWith("@git:")) return [{ raw, kind: "git", count: Math.max(1, Math.min(20, Number(raw.slice(5)))) }];
  if (raw.startsWith("@url:")) return [{ raw, kind: "url", value: raw.slice(5) }];
  if (raw.startsWith("@folder:")) return [{ raw, kind: "folder", value: raw.slice(8) }];
  const value = raw.startsWith("@file:") ? raw.slice(6) : raw.slice(1);
  const ranged = value.match(/^(.*):(\d+)-(\d+)$/);
  if (!ranged) return [{ raw, kind: "file", value }];
  return [{ raw, kind: "file", value: ranged[1]!, range: [Number(ranged[2]), Number(ranged[3])] }];
}

/** Expand refs into one bounded, source-labelled context block plus visible warnings. */
export async function expandContextRefs(input: string, root: string, deps: ExpandDeps = {}): Promise<ExpandResult> {
  const refs = parseContextRefs(input);
  const maxRef = deps.maxRefChars ?? MAX_REF_CHARS;
  const maxTotal = deps.maxTotalChars ?? MAX_CONTEXT_CHARS;
  const blocks: string[] = [], expanded: string[] = [], warnings: string[] = [];
  let used = 0;
  for (const ref of refs) {
    const result = await expandOne(ref, root, deps);
    if (!result.ok) { warnings.push(`${ref.raw}: ${result.warning}`); continue; }
    if (result.warning) warnings.push(`${ref.raw}: ${result.warning}`);
    if (result.payload.length > maxRef) { warnings.push(`${ref.raw}: exceeds the ${maxRef} character limit`); continue; }
    if (used + result.payload.length > maxTotal) { warnings.push(`${ref.raw}: exceeds the total context limit (${maxTotal} characters)`); continue; }
    blocks.push(result.block); expanded.push(ref.raw); used += result.payload.length;
  }
  const warningBlock = warnings.length ? `<context-warnings>\n${warnings.join("\n")}\n</context-warnings>` : "";
  return { block: [warningBlock, ...blocks].filter(Boolean).join("\n\n"), expanded, warnings };
}

type OneResult = { ok: true; block: string; payload: string; warning?: string } | { ok: false; warning: string };

async function expandOne(ref: ContextRef, root: string, deps: ExpandDeps): Promise<OneResult> {
  try {
    if (ref.kind === "file") return await expandFile(ref, root);
    if (ref.kind === "folder") return await expandFolder(ref, root);
    if (ref.kind === "url") return wrapUrl(ref, await (deps.fetchUrl ?? fetchPublicText)(ref.value));
    return await expandGit(ref, root, deps.git ?? defaultGit(root));
  } catch (error) {
    return { ok: false, warning: (error as Error).message };
  }
}

function scopedPath(root: string, path: string): string {
  if (!path || isAbsolute(path)) throw new Error("outside project root");
  const absolute = resolve(root, path);
  const rel = relative(resolve(root), absolute);
  if (rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(rel)) {
    throw new Error("outside project root");
  }
  if (SENSITIVE_RE.test(rel)) throw new Error("sensitive path requires an explicit file tool approval");
  return absolute;
}

async function expandFile(ref: Extract<ContextRef, { kind: "file" }>, root: string): Promise<OneResult> {
  const buffer = await readFile(scopedPath(root, ref.value)).catch(() => null);
  if (!buffer) return { ok: false, warning: "missing or unreadable file" };
  if (buffer.includes(0)) return { ok: false, warning: "binary file refused" };
  const full = buffer.toString("utf8");
  const payload = ref.range ? sliceLines(full, ref.range) : full;
  const lines = ref.range ? ` lines="${ref.range[0]}-${ref.range[1]}"` : "";
  return { ok: true, payload, block: `<file path="${attr(ref.value)}"${lines}>\n${payload}\n</file>` };
}

function sliceLines(text: string, range: [number, number]): string {
  const start = Math.max(1, range[0]), end = Math.max(start, range[1]);
  return text.split(/\r?\n/).slice(start - 1, end).join("\n");
}

async function expandFolder(ref: Extract<ContextRef, { kind: "folder" }>, root: string): Promise<OneResult> {
  const base = scopedPath(root, ref.value);
  const files: string[] = [];
  await walkFolder(base, base, files);
  const limited = files.length > MAX_FOLDER_FILES;
  const payload = files.length ? files.slice(0, MAX_FOLDER_FILES).join("\n") : "(empty folder)";
  const warning = limited ? `folder listing limited to ${MAX_FOLDER_FILES} files` : undefined;
  return { ok: true, payload, warning, block: `<folder path="${attr(ref.value)}">\n${payload}\n</folder>` };
}

async function walkFolder(base: string, dir: string, files: string[]): Promise<void> {
  if (files.length > MAX_FOLDER_FILES) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await walkFolder(base, path, files);
    else files.push(relative(base, path));
    if (files.length > MAX_FOLDER_FILES) return;
  }
}

async function expandGit(ref: Exclude<ContextRef, { kind: "file" | "folder" | "url" }>, root: string, git: (args: string[]) => Promise<string>): Promise<OneResult> {
  void root;
  const args = ref.kind === "diff" ? ["diff", "--no-ext-diff"]
    : ref.kind === "staged" ? ["diff", "--cached", "--no-ext-diff"]
    : ["log", `-${ref.count}`, "--oneline", "--stat"];
  const payload = await git(args) || "(no changes)";
  const attrs = ref.kind === "git" ? `kind="history" count="${ref.count}"` : `kind="${ref.kind}"`;
  return { ok: true, payload, block: `<git ${attrs}>\n${payload}\n</git>` };
}

function defaultGit(root: string): (args: string[]) => Promise<string> {
  return async (args) => (await run("git", args, { cwd: root, maxBuffer: MAX_CONTEXT_CHARS * 2 })).stdout.trim();
}

function wrapUrl(ref: Extract<ContextRef, { kind: "url" }>, payload: string): OneResult {
  return { ok: true, payload, block: `<url href="${attr(ref.value)}">\n${payload}\n</url>` };
}

async function fetchPublicText(start: string): Promise<string> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const guard = await assertPublicUrl(url);
    if (!guard.ok) throw new Error(guard.error);
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    const redirect = redirectTarget(response, url);
    if (redirect) {
      url = redirect;
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return responseText(response, url);
  }
  throw new Error(`too many redirects (>${MAX_REDIRECTS})`);
}

function redirectTarget(response: Response, current: string): string | null {
  if (response.status < 300 || response.status >= 400) return null;
  const location = response.headers.get("location");
  if (!location) throw new Error(`redirect ${response.status} has no location`);
  return new URL(location, current).href;
}

async function responseText(response: Response, url: string): Promise<string> {
  const body = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("html")) return body;
  const readable = extractReadable(body, response.url || url);
  return readable.title ? `# ${readable.title}\n\n${readable.text}` : readable.text;
}

function attr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
