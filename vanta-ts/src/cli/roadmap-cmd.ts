// `vanta roadmap` command handler — extracted from ops.ts (CODE-SIZE-GATE).

import { execSync } from "node:child_process";
import type { RoadmapItem } from "../roadmap/schema.js";
import type { RoadmapStatusSummary } from "../roadmap/status-summary.js";

type RoadmapStatusModule = typeof import("../roadmap/status-summary.js");

async function handleRoadmapServe(repoRoot: string): Promise<void> {
  const port = Number(process.env.VANTA_ROADMAP_PORT) || 7789;
  const [{ serveRoadmap }, { buildRoadmap }] = await Promise.all([
    import("../roadmap/server.js"),
    import("../roadmap/build.js"),
  ]);
  await buildRoadmap(repoRoot);
  setTimeout(() => {
    try { execSync(`open "http://localhost:${port}/roadmap/board"`); } catch {}
  }, 300);
  await serveRoadmap(repoRoot, port);
}

async function handleRoadmapMove(repoRoot: string, args: string[]): Promise<number> {
  const id = args[1];
  const status = args[2];
  if (!id || !status) {
    console.error("Usage: vanta roadmap move <id> <status> [--force]");
    console.error("  status: shipped | building | blocked | next | horizon | parked");
    process.exit(1);
  }
  const { moveRoadmapItem, RoadmapDependencyError, RoadmapParkedReviveError, RoadmapProofGateError, WipLimitError } = await import("../roadmap/move.js");
  const { STATUS } = await import("../roadmap/schema.js");
  const force = args.includes("--force");
  if (!(STATUS as readonly string[]).includes(status)) {
    console.error(`Invalid status '${status}'. Valid: ${STATUS.join(", ")}`);
    process.exit(1);
  }
  try {
    const item = await moveRoadmapItem(repoRoot, id, status as import("../roadmap/schema.js").Status, { force });
    console.log(`  ✓ Moved ${item.id} → ${status}: ${item.title}`);
    return 0;
  } catch (err) {
    if (err instanceof RoadmapDependencyError || err instanceof RoadmapParkedReviveError || err instanceof RoadmapProofGateError || err instanceof WipLimitError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }
}

async function handleRoadmapDecompose(repoRoot: string, args: string[]): Promise<void> {
  const id = args[2];
  if (!id) { console.error("Usage: vanta roadmap decompose <id> [--apply]"); process.exit(1); }
  const { findCard, buildProposal, formatProposal, applyProposal } = await import("../roadmap/decompose.js");
  const card = await findCard(repoRoot, id);
  if (!card) { console.error(`Card not found: ${id}`); process.exit(1); }
  const proposal = buildProposal(card);
  console.log(formatProposal(proposal));
  if (!args.includes("--apply")) {
    console.log("\nRun with --apply to write these child cards to roadmap.json.");
    return;
  }
  const { added, skipped } = await applyProposal(repoRoot, proposal);
  if (added.length) console.log(`  ✓ added: ${added.join(", ")}`);
  if (skipped.length) console.log(`  · skipped (already exist): ${skipped.join(", ")}`);
}

async function handleRoadmapUnblock(repoRoot: string, args: string[]): Promise<void> {
  const [{ readFile }, { join }, { RoadmapSchema }, { buildUnblockPlans, formatUnblockPlans }] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
    import("../roadmap/schema.js"),
    import("../roadmap/unblock.js"),
  ]);
  const raw = await readFile(join(repoRoot, "roadmap.json"), "utf8");
  const data = RoadmapSchema.parse(JSON.parse(raw));
  const ids = args.slice(1).filter((arg) => !arg.startsWith("--"));
  const plans = buildUnblockPlans(data.items, ids);
  console.log(args.includes("--json") ? JSON.stringify(plans, null, 2) : formatUnblockPlans(plans));
}

function statusExitCode(summary: RoadmapStatusSummary, args: string[], openOnly: boolean): number {
  if (openOnly || args.includes("--require-complete")) return summary.complete ? 0 : 1;
  if (args.includes("--require-drained")) return summary.activeDrained ? 0 : 1;
  return 0;
}

function printRoadmapStatus(items: RoadmapItem[], args: string[], status: RoadmapStatusModule, summary: RoadmapStatusSummary): void {
  const openOnly = args.includes("--open");
  if (args.includes("--json")) {
    console.log(JSON.stringify(openOnly ? status.openRoadmapItems(items) : summary, null, 2));
  } else if (openOnly) {
    console.log(status.formatRoadmapOpenWork(items));
  } else if (args.includes("--require-complete")) {
    console.log(status.formatRoadmapCompletionGate(items));
  } else if (args.includes("--require-drained")) {
    console.log(status.formatRoadmapDrainGate(items));
  } else {
    console.log(status.formatRoadmapStatus(items));
  }
}

async function handleRoadmapStatus(repoRoot: string, args: string[]): Promise<number> {
  const [{ readFile }, { join }, { RoadmapSchema }, status] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
    import("../roadmap/schema.js"),
    import("../roadmap/status-summary.js"),
  ]);
  const raw = await readFile(join(repoRoot, "roadmap.json"), "utf8");
  const data = RoadmapSchema.parse(JSON.parse(raw));
  const summary = status.summarizeRoadmapStatus(data.items);
  const openOnly = args.includes("--open");
  printRoadmapStatus(data.items, args, status, summary);
  return statusExitCode(summary, args, openOnly);
}

export async function runRoadmapCommand(repoRoot: string, args: string[] = []): Promise<number | void> {
  if (args[0] === "serve") return handleRoadmapServe(repoRoot);
  if (args[0] === "move") return handleRoadmapMove(repoRoot, args);
  if (args[0] === "unblock") return handleRoadmapUnblock(repoRoot, args);
  if (args[0] === "status") return handleRoadmapStatus(repoRoot, args);
  if (args[1] === "decompose") return handleRoadmapDecompose(repoRoot, args);

  const { buildRoadmap } = await import("../roadmap/build.js");
  const htmlPath = await buildRoadmap(repoRoot);
  execSync(`open "${htmlPath}"`);
  console.log(`  → opened ${htmlPath}`);
}
