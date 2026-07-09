import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";

export const IntentSpecSchema = z.object({
  version: z.literal(1),
  target: z.string(),
  hash: z.string(),
  exports: z.array(z.string()),
  functions: z.array(z.string()),
  classes: z.array(z.string()),
  signals: z.array(z.string()),
  review: z.string(),
});
export type IntentSpec = z.infer<typeof IntentSpecSchema>;
export type IntentCheck = { ok: boolean; drift: string[]; current: IntentSpec };

export async function extractIntentSpecFile(target: string): Promise<IntentSpec> {
  return extractIntentSpec(target, await readFile(target, "utf8"));
}

export function extractIntentSpec(target: string, source: string): IntentSpec {
  const exports = unique([
    ...matches(source, /\bexport\s+(?:async\s+)?(?:function|const|class|type|interface)\s+([A-Za-z0-9_]+)/g),
    ...matches(source, /\bexport\s*\{\s*([^}]+)\s*\}/g).flatMap((s) => s.split(",").map((p) => p.trim().split(/\s+as\s+/i).at(-1) ?? "")),
  ]);
  const functions = unique(matches(source, /\b(?:async\s+)?function\s+([A-Za-z0-9_]+)|\bconst\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/g));
  const classes = unique(matches(source, /\bclass\s+([A-Za-z0-9_]+)/g));
  const signals = unique([...exports, ...functions, ...classes].flatMap(splitName)).slice(0, 20);
  return {
    version: 1,
    target,
    hash: createHash("sha256").update(source).digest("hex").slice(0, 16),
    exports,
    functions,
    classes,
    signals,
    review: reviewText({ exports, functions, classes, signals }),
  };
}

export async function writeIntentSpec(out: string, spec: IntentSpec): Promise<string> {
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
  return out;
}

export async function readIntentSpec(path: string): Promise<IntentSpec> {
  return IntentSpecSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

export async function checkIntentDrift(target: string, specPath: string): Promise<IntentCheck> {
  const expected = await readIntentSpec(specPath);
  const current = await extractIntentSpecFile(target);
  const drift = [
    ...missing("export", expected.exports, current.exports),
    ...missing("function", expected.functions, current.functions),
    ...missing("class", expected.classes, current.classes),
    ...missing("signal", expected.signals, current.signals),
  ];
  return { ok: drift.length === 0, drift, current };
}

export function formatIntentSpec(spec: IntentSpec): string {
  return [
    `Intent spec: ${spec.target}`,
    `hash: ${spec.hash}`,
    `exports: ${spec.exports.join(", ") || "(none)"}`,
    `functions: ${spec.functions.join(", ") || "(none)"}`,
    `classes: ${spec.classes.join(", ") || "(none)"}`,
    `signals: ${spec.signals.join(", ") || "(none)"}`,
    "",
    spec.review,
  ].join("\n");
}

function matches(source: string, re: RegExp): string[] {
  return [...source.matchAll(re)].flatMap((m) => m.slice(1).filter(Boolean));
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort();
}

function missing(kind: string, expected: string[], actual: string[]): string[] {
  const have = new Set(actual);
  return expected.filter((x) => !have.has(x)).map((x) => `${kind} drift: missing ${x}`);
}

function splitName(name: string): string[] {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter((s) => s.length > 2).map((s) => s.toLowerCase());
}

function reviewText(spec: Pick<IntentSpec, "exports" | "functions" | "classes" | "signals">): string {
  return [
    "Reviewable intent",
    `- Public surface: ${spec.exports.join(", ") || "none detected"}`,
    `- Internal behavior anchors: ${[...spec.functions, ...spec.classes].join(", ") || "none detected"}`,
    `- Intent signals: ${spec.signals.join(", ") || "none detected"}`,
  ].join("\n");
}
