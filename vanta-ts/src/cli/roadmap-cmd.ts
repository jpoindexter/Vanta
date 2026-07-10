// `vanta roadmap` command handler — extracted from ops.ts (CODE-SIZE-GATE).

import { execSync } from "node:child_process";

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

async function handleRoadmapMove(repoRoot: string, args: string[]): Promise<void> {
  const id = args[1];
  const status = args[2];
  if (!id || !status) {
    console.error("Usage: vanta roadmap move <id> <status> [--force]");
    console.error("  status: shipped | building | blocked | next | horizon | parked");
    process.exit(1);
  }
  const { moveRoadmapItem } = await import("../roadmap/move.js");
  const { STATUS } = await import("../roadmap/schema.js");
  const force = args.includes("--force");
  if (!(STATUS as readonly string[]).includes(status)) {
    console.error(`Invalid status '${status}'. Valid: ${STATUS.join(", ")}`);
    process.exit(1);
  }
  const item = await moveRoadmapItem(repoRoot, id, status as import("../roadmap/schema.js").Status, { force });
  console.log(`  ✓ Moved ${item.id} → ${status}: ${item.title}`);
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
  console.log(formatUnblockPlans(buildUnblockPlans(data.items, ids)));
}

async function handleRoadmapStatus(repoRoot: string): Promise<void> {
  const [{ readFile }, { join }, { RoadmapSchema }, { formatRoadmapStatus }] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
    import("../roadmap/schema.js"),
    import("../roadmap/status-summary.js"),
  ]);
  const raw = await readFile(join(repoRoot, "roadmap.json"), "utf8");
  const data = RoadmapSchema.parse(JSON.parse(raw));
  console.log(formatRoadmapStatus(data.items));
}

export async function runRoadmapCommand(repoRoot: string, args: string[] = []): Promise<void> {
  if (args[0] === "serve") return handleRoadmapServe(repoRoot);
  if (args[0] === "move") return handleRoadmapMove(repoRoot, args);
  if (args[0] === "unblock") return handleRoadmapUnblock(repoRoot, args);
  if (args[0] === "status") return handleRoadmapStatus(repoRoot);
  if (args[1] === "decompose") return handleRoadmapDecompose(repoRoot, args);

  const { buildRoadmap } = await import("../roadmap/build.js");
  const htmlPath = await buildRoadmap(repoRoot);
  execSync(`open "${htmlPath}"`);
  console.log(`  → opened ${htmlPath}`);
}
