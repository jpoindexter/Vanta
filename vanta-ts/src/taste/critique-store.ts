import { appendFile, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveVantaHome } from "../store/home.js";

// Persistent Jason-specific taste model + before/after critique memory.
// Two stores, global across projects (~/.vanta):
//   taste-model[-<project>].json — the mutable preference model + brand defaults
//   taste-critiques.jsonl        — append-only critique log (before/after memory)
// The model seeds with brand-safe defaults on first read so an artifact is
// never scored against a blank slate.

export const AXES = ["clarity", "usefulness", "beauty", "credibility", "actionability"] as const;
export type Axis = (typeof AXES)[number];

/** Per-axis importance weight the model applies when aggregating an overall score. */
export type AxisWeights = Record<Axis, number>;

/** Brand-safe defaults the model seeds with — concrete, not generic. */
export type BrandDefaults = {
  /** Forbidden visual moves (the AI-slop blocklist). */
  avoid: string[];
  /** Preferred palette directions. */
  palette: string[];
  /** Preferred typography directions. */
  type: string[];
  /** Layout/spacing defaults. */
  layout: string[];
  /** Iconography defaults. */
  icon: string[];
};

export type TasteModel = {
  version: 1;
  /** Project this model is scoped to ("default" = global). */
  project: string;
  weights: AxisWeights;
  brand: BrandDefaults;
  /** Free-text preference signals the model has learned. */
  preferences: string[];
  updated: string;
};

/** One recorded critique — the before/after visual critique memory. */
export type Critique = {
  kind: "critique";
  project: string;
  /** What was critiqued: a label or path. */
  artifact: string;
  scores: Record<Axis, number>;
  overall: number;
  notes: string[];
  /** Links a "before" to a later "after" of the same artifact. */
  phase: "before" | "after" | "single";
  ts: string;
};

const DEFAULT_WEIGHTS: AxisWeights = {
  clarity: 1.2,
  usefulness: 1.3,
  beauty: 1,
  credibility: 1,
  actionability: 1.1,
};

/** Brand-safe defaults — the standing anti-slop rules new artifacts inherit. */
export const BRAND_SAFE_DEFAULTS: BrandDefaults = {
  avoid: [
    "blue-to-purple gradients",
    "generic SaaS hero with centered headline plus two buttons",
    "emoji as decoration",
    "stock-photo people",
    "drop shadows everywhere",
    "lorem ipsum filler that ships",
  ],
  palette: ["one confident accent over a neutral base", "high text/background contrast (WCAG AA+)"],
  type: ["one type family with real weight contrast", "generous line-height, restrained sizes"],
  layout: ["8pt spacing scale", "intentional whitespace over density", "real content widths"],
  icon: ["one consistent icon set", "optical size matched to text", "no mixed icon styles"],
};

export function defaultModel(project = "default"): TasteModel {
  return {
    version: 1,
    project,
    weights: { ...DEFAULT_WEIGHTS },
    brand: structuredClone(BRAND_SAFE_DEFAULTS),
    preferences: [],
    updated: new Date().toISOString(),
  };
}

/** Reduce a project name to a safe filename slug (no traversal). */
export function slugProject(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\-_]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "default"
  );
}

function modelPath(project: string, env: NodeJS.ProcessEnv): string {
  const slug = slugProject(project);
  const file = slug === "default" ? "taste-model.json" : `taste-model-${slug}.json`;
  return join(resolveVantaHome(env), file);
}

function critiquePath(env: NodeJS.ProcessEnv): string {
  return join(resolveVantaHome(env), "taste-critiques.jsonl");
}

/** Read the taste model, seeding brand-safe defaults if none exists yet. */
export async function readModel(
  project = "default",
  env: NodeJS.ProcessEnv = process.env,
): Promise<TasteModel> {
  try {
    const raw = JSON.parse(await readFile(modelPath(project, env), "utf8")) as Partial<TasteModel>;
    const base = defaultModel(project);
    return {
      ...base,
      ...raw,
      project,
      weights: { ...base.weights, ...raw.weights },
      brand: { ...base.brand, ...raw.brand },
      preferences: raw.preferences ?? base.preferences,
    };
  } catch {
    return defaultModel(project);
  }
}

export async function writeModel(model: TasteModel, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await mkdir(resolveVantaHome(env), { recursive: true });
  const next = { ...model, updated: new Date().toISOString() };
  await writeFile(modelPath(model.project, env), JSON.stringify(next, null, 2) + "\n", "utf8");
}

export async function appendCritique(rec: Critique, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await mkdir(resolveVantaHome(env), { recursive: true });
  await appendFile(critiquePath(env), JSON.stringify(rec) + "\n", "utf8");
}

export async function readCritiques(env: NodeJS.ProcessEnv = process.env): Promise<Critique[]> {
  try {
    return (await readFile(critiquePath(env), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Critique);
  } catch {
    return [];
  }
}

/** Critiques for one artifact label, oldest->newest (the before/after trail). Pure. */
export function critiquesFor(recs: Critique[], project: string, artifact: string): Critique[] {
  return recs.filter((c) => c.project === project && c.artifact === artifact);
}
