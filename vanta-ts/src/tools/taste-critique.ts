import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { resolveInScope } from "../scope.js";
import {
  readModel, writeModel, appendCritique, readCritiques, critiquesFor,
  type Critique,
} from "../taste/critique-store.js";
import {
  critiqueArtifact, formatCritique, formatDelta, axisOutOfFive,
  type ArtifactKind, type CritiqueResult,
} from "../taste/critique.js";

const Args = z.object({
  action: z.enum(["score", "before", "after", "brand", "prefer", "history"]),
  artifact: z.string().min(1).optional(),
  content: z.string().optional(),
  path: z.string().optional(),
  kind: z.enum(["text", "markdown", "html"]).optional(),
  project: z.string().optional(),
  preference: z.string().optional(),
});
type Parsed = z.infer<typeof Args>;

function inferKind(kind: ArtifactKind | undefined, path: string | undefined): ArtifactKind {
  if (kind) return kind;
  if (path && /\.html?$/i.test(path)) return "html";
  if (path && /\.(md|markdown)$/i.test(path)) return "markdown";
  return "text";
}

async function loadContent(a: Parsed, ctx: ToolContext): Promise<{ ok: true; content: string } | ToolResult> {
  if (a.content !== undefined) return { ok: true, content: a.content };
  if (!a.path) return { ok: false, output: "score needs content or path" };
  const scoped = resolveInScope(a.path, ctx.root);
  if (!scoped.ok) return { ok: false, output: `path is outside scope: ${a.path}` };
  try {
    return { ok: true, content: await readFile(scoped.path, "utf8") };
  } catch {
    return { ok: false, output: `cannot read artifact: ${a.path}` };
  }
}

async function critique(a: Parsed, ctx: ToolContext): Promise<{ result: CritiqueResult; kind: ArtifactKind } | ToolResult> {
  const loaded = await loadContent(a, ctx);
  if (!("content" in loaded)) return loaded;
  const project = a.project ?? "default";
  const model = await readModel(project);
  const kind = inferKind(a.kind, a.path);
  const result = critiqueArtifact({ content: loaded.content, kind }, model.weights, model.brand);
  return { result, kind };
}

async function record(a: Parsed, result: CritiqueResult, phase: Critique["phase"]): Promise<void> {
  const project = a.project ?? "default";
  await appendCritique({
    kind: "critique", project, artifact: a.artifact ?? a.path ?? "untitled",
    scores: result.scores, overall: result.overall, notes: result.notes,
    phase, ts: new Date().toISOString(),
  });
}

async function doScore(a: Parsed, ctx: ToolContext, phase: Critique["phase"]): Promise<ToolResult> {
  const c = await critique(a, ctx);
  if (!("result" in c)) return c;
  await record(a, c.result, phase);
  const label = a.artifact ?? a.path ?? "untitled";
  if (phase !== "after") return { ok: true, output: formatCritique(label, c.result) };
  const project = a.project ?? "default";
  const prior = critiquesFor(await readCritiques(), project, label).filter((x) => x.phase === "before");
  const last = prior[prior.length - 1];
  if (!last) return { ok: true, output: formatCritique(label, c.result) + "\n(no prior 'before' to compare)" };
  const beforeResult: CritiqueResult = { scores: last.scores, overall: last.overall, notes: last.notes };
  return { ok: true, output: formatCritique(label, c.result) + "\n" + formatDelta(beforeResult, c.result) };
}

async function doBrand(a: Parsed): Promise<ToolResult> {
  const model = await readModel(a.project ?? "default");
  const b = model.brand;
  const lines = [
    `Brand-safe defaults (project: ${model.project})`,
    `Avoid:   ${b.avoid.join("; ")}`,
    `Palette: ${b.palette.join("; ")}`,
    `Type:    ${b.type.join("; ")}`,
    `Layout:  ${b.layout.join("; ")}`,
    `Icon:    ${b.icon.join("; ")}`,
    model.preferences.length ? `Learned preferences:\n${model.preferences.map((p) => `  - ${p}`).join("\n")}` : "Learned preferences: (none yet)",
  ];
  return { ok: true, output: lines.join("\n") };
}

async function doPrefer(a: Parsed): Promise<ToolResult> {
  if (!a.preference) return { ok: false, output: "prefer needs a preference string" };
  const project = a.project ?? "default";
  const model = await readModel(project);
  if (!model.preferences.includes(a.preference)) model.preferences.push(a.preference);
  await writeModel(model);
  return { ok: true, output: `learned preference for ${project}: "${a.preference}" (${model.preferences.length} total)` };
}

async function doHistory(a: Parsed): Promise<ToolResult> {
  const project = a.project ?? "default";
  const label = a.artifact ?? a.path;
  const all = await readCritiques();
  const recs = label ? critiquesFor(all, project, label) : all.filter((c) => c.project === project);
  if (!recs.length) return { ok: true, output: `no critique memory for ${label ?? project} yet — run action:score first` };
  const lines = recs.slice(-12).map((c) => `  ${c.ts}  [${c.phase}] ${c.artifact} — ${axisOutOfFive(c.overall)}/5`);
  return { ok: true, output: `Critique memory (${recs.length}):\n${lines.join("\n")}` };
}

const DESCRIPTION =
  "Score and critique a generated artifact against a persisted Jason-specific taste model so it isn't generic. " +
  "Five axes (clarity, usefulness, beauty, credibility, actionability) plus brand-safe defaults the model seeds with. " +
  "action:score critiques an artifact (content or in-scope path; kind text|markdown|html) and records it; " +
  "action:before / action:after record a phased critique — after also prints the per-axis delta vs the latest before (before/after memory); " +
  "action:brand shows the brand-safe defaults + learned preferences; " +
  "action:prefer adds a durable preference signal to the model (preference=...); " +
  "action:history shows the recorded critique trail. project scopes a per-project model + memory (default = global). Records only — never edits the artifact.";

export const tasteCritiqueTool: Tool = {
  schema: {
    name: "taste_critique",
    description: DESCRIPTION,
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["score", "before", "after", "brand", "prefer", "history"], description: "score | before | after | brand | prefer | history" },
        artifact: { type: "string", description: "label for the artifact (used for before/after pairing + history)" },
        content: { type: "string", description: "inline artifact content to critique" },
        path: { type: "string", description: "in-scope path to read the artifact from (alternative to content)" },
        kind: { type: "string", enum: ["text", "markdown", "html"], description: "artifact kind (inferred from path extension if omitted)" },
        project: { type: "string", description: "per-project taste model + memory scope (default = global)" },
        preference: { type: "string", description: "a durable preference signal to learn (action:prefer)" },
      },
      required: ["action"],
    },
  },
  describeForSafety: (a) => {
    const path = typeof a.path === "string" ? ` ${a.path}` : "";
    return `taste_critique ${String(a.action ?? "")}${path}`;
  },
  async execute(raw, ctx) {
    const p = Args.safeParse(raw);
    if (!p.success) return { ok: false, output: "taste_critique needs action: score|before|after|brand|prefer|history" };
    const a = p.data;
    if (a.action === "brand") return doBrand(a);
    if (a.action === "prefer") return doPrefer(a);
    if (a.action === "history") return doHistory(a);
    if (a.action === "before") return doScore(a, ctx, "before");
    if (a.action === "after") return doScore(a, ctx, "after");
    return doScore(a, ctx, "single");
  },
};
