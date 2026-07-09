async function runMemoryForget(rest: string[]): Promise<void> {
  const { pruneStaleBlocks, getMemoryFootprint, formatForgetSummary } = await import("../memory/forget.js");
  const { memoriesDir } = await import("../store/home.js");
  const { readdir } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  const ttlDays = rest[1] ? Number(rest[1]) : undefined;
  const dir = memoriesDir(process.env);
  if (!existsSync(dir)) { console.log("(no memories yet)"); return; }
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md") && !f.endsWith(".archived.md"));
  if (!files.length) { console.log("(no memory files)"); return; }
  const before = await getMemoryFootprint(process.env);
  const results = await Promise.all(files.map((f) => pruneStaleBlocks(f.replace(/\.md$/, ""), process.env, { ttlDays })));
  const after = await getMemoryFootprint(process.env);
  console.log(formatForgetSummary(results, before, after));
}

async function runVaultCompile(rest: string[]): Promise<void> {
  const rawDir = rest[1];
  const vaultIdx = rest.indexOf("--vault");
  const vault = vaultIdx === -1 ? null : rest[vaultIdx + 1];
  if (!rawDir || !vault) {
    console.log("usage: vanta memory vault-compile <raw-dir> --vault <vault-dir> [--apply]");
    return;
  }
  const { compileVault } = await import("../brain/vault-compile.js");
  const result = await compileVault(rawDir, vault, { apply: rest.includes("--apply") });
  console.log(`${rest.includes("--apply") ? "applied" : "review"} vault compile: ${result.changed.length} changed file(s), ${result.rawFiles.length} raw source(s)`);
  console.log(result.diff);
}

export async function runMemoryCommand(rest: string[]): Promise<void> {
  const sub = rest[0];
  if (sub === "vault-compile") return runVaultCompile(rest);
  if (sub === "search") {
    const query = rest.slice(1).join(" ").trim();
    if (!query) { console.log("usage: vanta memory search <query>"); return; }
    const { searchArchive } = await import("../memory/archive.js");
    const results = await searchArchive(query, { maxResults: 20 });
    if (!results.length) { console.log(`(no archive matches for "${query}")`); return; }
    for (const r of results) console.log(`[${r.sessionId}] ${r.role}: ${r.excerpt}`);
    return;
  }
  if (sub === "forget") return runMemoryForget(rest);
  if (sub === "footprint") {
    const { getMemoryFootprint } = await import("../memory/forget.js");
    const fp = await getMemoryFootprint(process.env);
    console.log(`memory footprint: ${fp.goals} goal(s), ${fp.totalBytes} bytes`);
    for (const f of fp.files) console.log(`  goal ${f.goalId}: ${f.bytes}B, ${f.blocks} block(s)`);
    return;
  }
  console.log("usage: vanta memory vault-compile <raw-dir> --vault <vault-dir> [--apply] | vanta memory search <query> | vanta memory forget [ttl-days] | vanta memory footprint");
}
