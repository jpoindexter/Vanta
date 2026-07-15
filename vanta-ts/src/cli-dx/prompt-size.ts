import { join } from "node:path";
import { buildSystemPrompt } from "../prompt.js";
import { buildRegistry } from "../tools/index.js";
import { loadPromptNdPreferences } from "../nd/profile.js";

// CLI-DX-PACK — `vanta prompt-size`: where the per-turn token budget goes.
// Serves the frugality rule (rule 8) — the tool schemas + context files are
// usually the biggest line items, and this makes that visible.

export type SizePart = { label: string; bytes: number };

const tok = (bytes: number): number => Math.round(bytes / 4); // ~4 chars/token

/** Render a sorted byte/token breakdown with a total. Pure. */
export function formatSizes(parts: SizePart[]): string {
  const total = parts.reduce((n, p) => n + p.bytes, 0);
  const width = Math.max(6, ...parts.map((p) => p.label.length));
  const rows = [...parts]
    .sort((a, b) => b.bytes - a.bytes)
    .map((p) => `  ${p.label.padEnd(width)}  ${p.bytes.toLocaleString().padStart(8)} B  ~${tok(p.bytes).toLocaleString().padStart(7)} tok  ${total ? Math.round((p.bytes / total) * 100) : 0}%`);
  return [
    `  per-turn system prompt + tool schemas:`,
    ...rows,
    `  ${"".padEnd(width)}  ${"".padStart(8)}     ${"".padStart(7)}`,
    `  ${"TOTAL".padEnd(width)}  ${total.toLocaleString().padStart(8)} B  ~${tok(total).toLocaleString().padStart(7)} tok`,
  ].join("\n");
}

/** Assemble the current prompt (goals excluded — they need the kernel) + measure it. */
export async function runPromptSize(repoRoot: string): Promise<number> {
  const registry = buildRegistry();
  const tools = registry.schemas();
  const { resolveBrain } = await import("../brain/interface.js");
  const brain = await resolveBrain(process.env).digest(process.env).catch(() => "");
  const { listSkills } = await import("../skills/store.js");
  const skills = (await listSkills(process.env).catch(() => [])).map((s) => ({ name: s.meta.name, description: s.meta.description }));
  const ndPreferences = await loadPromptNdPreferences(process.env);
  const prompt = await buildSystemPrompt({
    root: repoRoot,
    soulPath: join(repoRoot, "SOUL.md"),
    goals: [],
    tools,
    now: new Date().toISOString(),
    brain,
    skills,
    outputDensity: ndPreferences?.outputDensity,
    ndPreferences,
  });
  const b = (s: string) => Buffer.byteLength(s);
  const parts: SizePart[] = [
    { label: "tool schemas", bytes: b(JSON.stringify(tools)) },
    { label: "system prompt", bytes: b(prompt) },
    { label: "brain digest", bytes: b(brain) },
    { label: "skill index", bytes: b(skills.map((s) => `${s.name}: ${s.description}`).join("\n")) },
  ];
  console.log(formatSizes(parts));
  console.log(`  (goals + per-turn memory excluded — they need a live kernel)`);
  return 0;
}
