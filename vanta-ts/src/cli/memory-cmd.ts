async function runMemoryForget(rest: string[]): Promise<void> {
  const { pruneStaleBlocks, getMemoryFootprint, formatForgetSummary } = await import("../memory/forget.js");
  const { resolveMemoryStore } = await import("../store/memory-store.js");
  const ttlDays = rest[1] ? Number(rest[1]) : undefined;
  const store = resolveMemoryStore(process.env);
  const entries = await store.list("memories");
  if (!entries.length) { console.log("(no memories yet)"); return; }
  const files = entries.filter((f) => f.endsWith(".md") && !f.endsWith(".archived.md"));
  if (!files.length) { console.log("(no memory files)"); return; }
  const before = await getMemoryFootprint(process.env);
  const results = await Promise.all(files.map((f) => pruneStaleBlocks(f.replace(/\.md$/, ""), process.env, { ttlDays })));
  const after = await getMemoryFootprint(process.env);
  console.log(formatForgetSummary(results, before, after));
}

export async function runMemoryCommand(rest: string[]): Promise<void> {
  const sub = rest[0];
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
  console.log("usage: vanta memory search <query> | vanta memory forget [ttl-days] | vanta memory footprint");
}
