import { readFile, writeFile } from "node:fs/promises";
import { relative } from "node:path";
import { z } from "zod";
import type { Violation } from "./size.js";

// SIZE-RATCHET: existing violations are recorded once; the gate then blocks only what is new or worse.
// shortcut: function/params/complexity compare by count, not identity, so a function that grows while
// its file's count stays the same passes; move to per-function keys if that starts to bite.

export const BASELINE_FILE = ".size-baseline.json";
/** An already-oversized file may grow by this many lines before the gate blocks it. */
export const GROWTH_ALLOWANCE_LINES = 20;

const FileBaselineSchema = z.object({
  lines: z.number().int().optional(),
  function: z.number().int().optional(),
  params: z.number().int().optional(),
  complexity: z.number().int().optional(),
});
const BaselineSchema = z.record(z.string(), FileBaselineSchema);

export type FileBaseline = z.infer<typeof FileBaselineSchema>;
export type Baseline = z.infer<typeof BaselineSchema>;

const LOCALE_TABLE = /\/i18n\/[a-z]{2,3}(-[A-Za-z0-9]+)?(_[A-Za-z0-9]+)*\.ts$/;
const GENERATED = /\.generated\.tsx?$/;

/** Locale tables and generated code are data, not logic: the size limits do not apply. */
export const isDataFile = (file: string): boolean => LOCALE_TABLE.test(file) || GENERATED.test(file);

const keyOf = (root: string, file: string): string => relative(root, file);

/** Record the current violations per file: its line count if over the file limit, and a count per other kind. */
export function buildBaseline(root: string, violations: Violation[]): Baseline {
  const out: Baseline = {};
  for (const v of violations) {
    const entry = (out[keyOf(root, v.file)] ??= {});
    if (v.kind === "file") entry.lines = v.actual;
    else entry[v.kind] = (entry[v.kind] ?? 0) + 1;
  }
  return out;
}

/** The violations that are new or worse than the baseline. A file with no entry is new: all of it counts. */
export function worsened(root: string, violations: Violation[], baseline: Baseline): Violation[] {
  const counts = new Map<string, number>();
  for (const v of violations) {
    if (v.kind !== "file") counts.set(`${v.file}|${v.kind}`, (counts.get(`${v.file}|${v.kind}`) ?? 0) + 1);
  }
  return violations.filter((v) => {
    const base = baseline[keyOf(root, v.file)];
    if (!base) return true;
    if (v.kind === "file") return base.lines === undefined || v.actual > base.lines + GROWTH_ALLOWANCE_LINES;
    return (counts.get(`${v.file}|${v.kind}`) ?? 0) > (base[v.kind] ?? 0);
  });
}

/** Parse a baseline file. Missing or malformed returns null, so the caller falls back to the strict gate. */
export async function readBaseline(path: string): Promise<Baseline | null> {
  try {
    const parsed = BaselineSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeBaseline(path: string, baseline: Baseline): Promise<void> {
  const sorted = Object.fromEntries(Object.entries(baseline).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(path, `${JSON.stringify(sorted, null, 1)}\n`);
}
