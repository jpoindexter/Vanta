import { z } from "zod";

// VANTA-BLUEPRINTS — named, parameterized scaffolds. A blueprint is DATA (a
// blueprint.json), so new ones are added by dropping a file under
// ~/.vanta/blueprints/<name>/ — never by editing src/. This module is the pure
// core: schema, {{var}} substitution, and a write-PLAN (no I/O); the CLI writes.

export const BlueprintVarSchema = z.object({
  key: z.string().min(1),
  description: z.string().default(""),
  default: z.string().optional(),
});

export const BlueprintFileSchema = z.object({
  /** Destination path, relative to the scaffold target dir. May contain {{vars}}. */
  path: z.string().min(1),
  /** File contents. {{var}} placeholders are substituted. */
  content: z.string(),
});

export const BlueprintSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  vars: z.array(BlueprintVarSchema).default([]),
  files: z.array(BlueprintFileSchema).min(1),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;

/** Parse the payload into a Blueprint, or null on shape mismatch. Pure. */
export function parseBlueprint(payload: unknown): Blueprint | null {
  const r = BlueprintSchema.safeParse(payload);
  return r.success ? r.data : null;
}

/** Parse `--var k=v` args into a record (last wins). Pure. */
export function parseVarArgs(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of args) {
    const eq = a.indexOf("=");
    if (eq > 0) out[a.slice(0, eq).trim()] = a.slice(eq + 1);
  }
  return out;
}

/**
 * Resolve the final variable values: provided value → declared default →
 * MISSING. Returns the values or the list of unfilled required keys. Pure. */
export function resolveVars(bp: Blueprint, provided: Record<string, string>): { values: Record<string, string> } | { missing: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const v of bp.vars) {
    const val = provided[v.key] ?? v.default;
    if (val === undefined) missing.push(v.key);
    else values[v.key] = val;
  }
  return missing.length ? { missing } : { values };
}

/** Substitute `{{key}}` placeholders (unknown placeholders are left intact). Pure. */
export function applyTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, key: string) => (key in values ? values[key]! : m));
}

export type PlannedFile = { path: string; content: string };

/**
 * Plan the files a blueprint would write under `targetDir`, with vars applied to
 * both paths and contents. Pure (no I/O, no collision check — the CLI does the
 * filesystem parts). Paths are joined with "/" (POSIX; the CLI normalizes). */
export function planBlueprint(bp: Blueprint, values: Record<string, string>, targetDir: string): PlannedFile[] {
  const base = targetDir.replace(/\/$/, "");
  return bp.files.map((f) => ({
    path: `${base}/${applyTemplate(f.path, values)}`.replace(/\/{2,}/g, "/"),
    content: applyTemplate(f.content, values),
  }));
}
