import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { writeSkill } from "../skills/store.js";
import { gateSkill, type GateResult } from "../learning/eval-gate.js";
import { extractReadable } from "../tools/web-fetch.js";
import { resolveInScope } from "../scope.js";
import { slugifySkillName } from "../store/home.js";
import type { Skill } from "../skills/types.js";
import type { LLMProvider } from "../providers/interface.js";
import type { SlashHandler, SlashResult } from "./types.js";

// VANTA-LEARN — /learn <url|path>: read a doc/URL, distill it into a reusable
// SKILL.md (procedure + pitfalls), gate it for quality, and save it editable +
// git-versioned under ~/.vanta/skills. The "build a skill from docs" flow,
// Vanta-native: deterministic local save, gated, no network write.

const MAX_SOURCE_CHARS = 24_000; // cap doc text fed to the distiller (token budget)
const USAGE = "  · usage: /learn <url|path> [as <name>] — build a skill from a doc/URL";

export type LearnDraft = { name: string; description: string; body: string };

export type LearnDeps = {
  /** Fetch + readable-ify the source (URL or local path) → title + text. */
  fetchText: (source: string) => Promise<{ title: string; text: string }>;
  /** Turn the doc into a raw distiller response (expected: a JSON object). */
  distill: (title: string, text: string) => Promise<string>;
  /** Persist the gated skill; returns its on-disk path. */
  write: (draft: LearnDraft) => Promise<{ path: string }>;
  /** Quality gate (thin body / refusal / shadow). */
  gate: (skill: Skill) => GateResult;
  now: () => Date;
};

/** Parse `<source> [as <name>]` → {source, name?}. Pure. */
export function parseLearnArg(arg: string): { source: string; name?: string } {
  const trimmed = arg.trim();
  const m = trimmed.match(/^(.*?)\s+as\s+(.+)$/i);
  if (m) return { source: m[1]!.trim(), name: m[2]!.trim() };
  return { source: trimmed };
}

/** A source is a URL when it has an http(s) protocol; else a local path. Pure. */
export function classifySource(source: string): "url" | "path" {
  return /^https?:\/\//i.test(source) ? "url" : "path";
}

/** Build the distiller prompt: turn doc text into a strict-JSON skill draft. Pure. */
export function buildDistillPrompt(title: string, text: string): string {
  return [
    "Turn the following document into a reusable agent SKILL.",
    "Extract the actionable PROCEDURE (numbered steps) and the PITFALLS/gotchas.",
    "Respond with ONLY a JSON object — no prose, no code fences:",
    '{"name":"<kebab-case-name>","description":"<one line>","body":"<markdown with ## Procedure and ## Pitfalls>"}',
    `Document title: ${title || "(untitled)"}`,
    "Document:",
    text.slice(0, MAX_SOURCE_CHARS),
  ].join("\n");
}

/** Extract the first `{...}` JSON object from text, tolerating fences/prose. Pure. */
function parseJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj: unknown = JSON.parse(raw.slice(start, end + 1));
    return obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Trimmed string field, or "" when absent/wrong-typed. Pure. */
function strField(o: Record<string, unknown>, key: string): string {
  return typeof o[key] === "string" ? (o[key] as string).trim() : "";
}

/** Tolerantly parse the distiller's response into a draft. Returns null on failure. Pure. */
export function parseDistillResponse(raw: string): LearnDraft | null {
  const o = parseJsonObject(raw);
  if (!o) return null;
  const name = strField(o, "name");
  const body = strField(o, "body");
  if (!name || !body) return null;
  return { name, description: strField(o, "description") || "A skill learned from a document.", body };
}

/** Orchestrate fetch → distill → gate → write. Deps injected for tests. */
export async function runLearn(
  source: string,
  nameOverride: string | undefined,
  deps: LearnDeps,
): Promise<SlashResult> {
  if (!source) return { output: USAGE };
  let fetched: { title: string; text: string };
  try {
    fetched = await deps.fetchText(source);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: `  · /learn could not read ${source}: ${msg}` };
  }
  if (!fetched.text.trim()) return { output: `  · /learn found no readable text at ${source}` };

  const draft = parseDistillResponse(await deps.distill(fetched.title, fetched.text));
  if (!draft) return { output: "  · /learn could not distill a skill from that source (no valid draft returned)" };

  const name = slugifySkillName(nameOverride?.trim() || draft.name);
  const when = deps.now().toISOString();
  const skill: Skill = {
    meta: { name, description: draft.description, created: when, updated: when, tags: ["vanta-learned", `learned-from:${source}`] },
    body: draft.body,
  };
  const verdict = deps.gate(skill);
  if (!verdict.passed) return { output: `  · /learn rejected the draft: ${verdict.reason}` };

  const { path } = await deps.write({ name, description: draft.description, body: draft.body });
  return { output: `  · learned skill "${name}" → ${path}\n  · edit it there, or load it on demand with the recall tool` };
}

/** Real source reader: URL → fetch + readability; local path → in-scope file read. */
async function readSource(source: string, repoRoot: string): Promise<{ title: string; text: string }> {
  if (classifySource(source) === "url") {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { title, text } = extractReadable(await res.text(), source);
    return { title: title || source, text };
  }
  const resolved = resolveInScope(source, repoRoot);
  if (!resolved.ok) throw new Error("path is outside the project scope");
  return { title: source, text: await readFile(resolved.path, "utf8") };
}

/** Real distiller: one provider call returning the raw JSON-ish text. */
async function distillViaProvider(provider: LLMProvider, title: string, text: string): Promise<string> {
  const res = await provider.complete([{ role: "user", content: buildDistillPrompt(title, text) }], []);
  return res.text;
}

/**
 * /learn <url|path> [as <name>] — read a doc/URL, distill a SKILL.md, gate it,
 * and save it editable + git-versioned under ~/.vanta/skills. Auto-writes the
 * gated skill (the gate + explicit invocation are the consent; it's reversible).
 */
export const learn: SlashHandler = async (arg, ctx) => {
  const { source, name } = parseLearnArg(arg);
  if (!source) return { output: USAGE };
  const repoRoot = dirname(ctx.dataDir);
  const provider = ctx.setup.provider;
  return runLearn(source, name, {
    fetchText: (s) => readSource(s, repoRoot),
    distill: (t, x) => distillViaProvider(provider, t, x),
    write: (d) => writeSkill({ name: d.name, description: d.description, body: d.body, tags: ["vanta-learned"] }, { env: ctx.env }).then((r) => ({ path: r.path })),
    gate: (skill) => gateSkill(skill, new Set()),
    now: ctx.now,
  });
};
