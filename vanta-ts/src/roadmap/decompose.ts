import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { RoadmapSchema } from "./schema.js";
import { addRoadmapItem } from "./add.js";
import type { RoadmapItem } from "./schema.js";

// KANBAN-DECOMPOSE: expand a roadmap card into ordered child cards.
// Uses the parent's summary + done criteria to generate slice IDs that
// can be worked on sequentially. Writes on approval (done: criteria reviewed).

export type DecomposeProposal = {
  parent: RoadmapItem;
  children: RoadmapItem[];
};

/** Generate child card IDs from a parent id (e.g. "FEATURE" → "FEATURE-S1", "FEATURE-S2"). */
export function childId(parentId: string, sliceNum: number): string {
  return `${parentId}-S${sliceNum}`;
}

/**
 * Build a decompose proposal from a parent card's done criteria.
 * This is the pure planning step — each bullet in the done criteria becomes a slice.
 * No LLM required for the basic case; the agent can enrich later.
 */
export function buildProposal(parent: RoadmapItem): DecomposeProposal {
  const done = (parent.done as string | undefined) ?? parent.summary;
  // Split done criteria into lines, filter meaningful ones.
  const criteriaLines = done
    .split(/\n|•|\.\s+/)
    .map((l) => l.trim().replace(/^[-*`]+/, "").trim())
    .filter((l) => l.length > 10 && !l.startsWith("#"));

  // If no meaningful lines, create one generic slice.
  const slices = criteriaLines.length > 1 ? criteriaLines : [done.slice(0, 120)];

  const children: RoadmapItem[] = slices.slice(0, 8).map((criteria, i) => ({
    id: childId(parent.id, i + 1),
    title: `${parent.title} — slice ${i + 1}`,
    summary: criteria,
    done: criteria,
    status: "next",
    track: parent.track,
    size: "S",
    tier: parent.tier,
    model: parent.model,
    effort: "low",
  }));

  return { parent, children };
}

/** Format a decompose proposal for human review. Pure. */
export function formatProposal(p: DecomposeProposal): string {
  const lines = [
    `Decompose: ${p.parent.id} — ${p.parent.title}`,
    `Will add ${p.children.length} child card(s):`,
  ];
  for (const c of p.children) {
    lines.push(`  + ${c.id}: ${c.title}`);
    lines.push(`    done: ${c.done?.slice(0, 80) ?? c.summary.slice(0, 80)}`);
  }
  return lines.join("\n");
}

/** Load a roadmap card by id. Returns null if not found. */
export async function findCard(repoRoot: string, id: string): Promise<RoadmapItem | null> {
  const src = join(repoRoot, "roadmap.json");
  const data = RoadmapSchema.parse(JSON.parse(await readFile(src, "utf8")));
  return data.items.find((i) => i.id.toLowerCase() === id.toLowerCase()) ?? null;
}

/**
 * Write the decompose proposal's child cards to roadmap.json.
 * Skips cards that already exist.
 */
export async function applyProposal(
  repoRoot: string,
  proposal: DecomposeProposal,
): Promise<{ added: string[]; skipped: string[] }> {
  const added: string[] = [];
  const skipped: string[] = [];
  for (const child of proposal.children) {
    try {
      await addRoadmapItem(repoRoot, child);
      added.push(child.id);
    } catch (err) {
      skipped.push(child.id);
      void err;
    }
  }
  return { added, skipped };
}

/** Schema for the roadmap_decompose tool args. */
export const DecomposeArgsSchema = z.object({
  id: z.string().min(1).describe("Roadmap card id to decompose"),
  apply: z.boolean().optional().describe("Write the child cards to roadmap.json (default false — preview only)"),
});
