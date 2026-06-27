import type { MigrationPlan } from "./plan.js";

// VANTA-MIGRATE — the per-item PICKER over a built MigrationPlan. Pure (no I/O):
// flatten a plan's importable items into a numbered list, parse a picker answer
// ("all"/"none"/"1,3"/"2-4" ranges) into selected numbers, and narrow a plan to a
// chosen subset (per-item) or a footprint (--skills/--mcp/--model). Split out of
// plan.ts for the size gate; re-exported from there so importers are unchanged.

/** One selectable line in the per-item picker. */
export type NumberedItem = { n: number; kind: "skill" | "mcp" | "model"; name: string };

/** Flatten a plan's importable items into a numbered list (skills, then MCP, then model). Pure. */
export function numberedItems(plan: MigrationPlan): NumberedItem[] {
  const items: NumberedItem[] = [];
  let n = 1;
  for (const s of plan.skills) items.push({ n: n++, kind: "skill", name: s.name });
  for (const m of plan.mcpServers) items.push({ n: n++, kind: "mcp", name: m.name });
  if (plan.modelConfig) items.push({ n: n++, kind: "model", name: `${plan.modelConfig.provider ?? "?"}/${plan.modelConfig.model ?? "?"}` });
  return items;
}

/** Render the numbered picker list. Pure. */
export function numberedList(items: NumberedItem[]): string {
  return ["  Select items to import:", ...items.map((i) => `    [${i.n}] ${i.kind}: ${i.name}`)].join("\n");
}

/** The valid 1-based numbers a single picker token contributes (a number or `a-b` range). Pure. */
function partNumbers(part: string, count: number): number[] {
  const range = part.match(/^(\d+)-(\d+)$/);
  if (range) {
    const out: number[] = [];
    for (let i = Number(range[1]); i <= Number(range[2]); i++) if (i >= 1 && i <= count) out.push(i);
    return out;
  }
  const num = Number(part);
  return Number.isInteger(num) && num >= 1 && num <= count ? [num] : [];
}

/** Parse a picker answer into selected 1-based numbers. "all"/""→all, "none"→none,
 *  else a comma/space list with optional `a-b` ranges (out-of-range dropped). Pure. */
export function parseItemSelection(input: string, count: number): Set<number> {
  const t = input.trim().toLowerCase();
  if (t === "" || t === "all" || t === "a") return new Set(Array.from({ length: count }, (_, i) => i + 1));
  if (t === "none" || t === "n") return new Set();
  const out = new Set<number>();
  for (const part of t.split(/[,\s]+/).filter(Boolean)) for (const n of partNumbers(part, count)) out.add(n);
  return out;
}

/** Drop everything not in `selected` from the plan. Pure. */
export function filterPlanByNumbers(plan: MigrationPlan, items: NumberedItem[], selected: Set<number>): MigrationPlan {
  const chosen = items.filter((i) => selected.has(i.n));
  const skillNames = new Set(chosen.filter((i) => i.kind === "skill").map((i) => i.name));
  const mcpNames = new Set(chosen.filter((i) => i.kind === "mcp").map((i) => i.name));
  return {
    ...plan,
    skills: plan.skills.filter((s) => skillNames.has(s.name)),
    mcpServers: plan.mcpServers.filter((m) => mcpNames.has(m.name)),
    modelConfig: chosen.some((i) => i.kind === "model") ? plan.modelConfig : null,
  };
}

/** Pre-narrow the plan to the footprints allowed by flags (--skills/--mcp/--model). Pure. */
export function narrowByFootprint(plan: MigrationPlan, sel: { skills: boolean; mcp: boolean; model: boolean }): MigrationPlan {
  return {
    ...plan,
    skills: sel.skills ? plan.skills : [],
    mcpServers: sel.mcp ? plan.mcpServers : [],
    modelConfig: sel.model ? plan.modelConfig : null,
  };
}
