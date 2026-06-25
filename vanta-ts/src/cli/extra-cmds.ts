// Extra COMMANDS table handlers, extracted from cli.ts (CODE-SIZE-GATE).
// Keep each handler self-contained; lazy-import heavier subsystems inside.

type PluginCatalog = Awaited<ReturnType<typeof import("../plugins/catalog.js").pluginById>>;

async function pluginInstall(id: string | undefined, pluginById: (id: string) => PluginCatalog): Promise<number> {
  if (!id) { console.error("usage: vanta plugins install <id>"); return 1; }
  const plugin = pluginById(id);
  if (!plugin) { console.error(`unknown plugin: ${id}`); return 1; }
  console.log(`Installing ${plugin.label}…`);
  await plugin.install();
  console.log(`✓ installed: ${plugin.label}`);
  return 0;
}

async function pluginRemove(id: string | undefined, pluginById: (id: string) => PluginCatalog): Promise<number> {
  if (!id) { console.error("usage: vanta plugins remove <id>"); return 1; }
  const plugin = pluginById(id);
  if (!plugin) { console.error(`unknown plugin: ${id}`); return 1; }
  await plugin.remove();
  console.log(`✓ removed state for: ${plugin.label}`);
  return 0;
}

/** `vanta plugins [list | install <id> | remove <id> | check-repo]` */
export async function runPluginsCommand(root: string, rest: string[]): Promise<number> {
  const { PLUGIN_CATALOG, pluginById, formatPluginList, checkNoPluginFilesInRepo } = await import("../plugins/catalog.js");
  const sub = rest[0] ?? "list";
  if (sub === "list" || !rest[0]) {
    const statuses = await Promise.all(PLUGIN_CATALOG.map(async (e) => ({ entry: e, installed: await e.checkInstalled() })));
    console.log(formatPluginList(statuses));
    return 0;
  }
  if (sub === "install") return pluginInstall(rest[1], pluginById);
  if (sub === "remove") return pluginRemove(rest[1], pluginById);
  if (sub === "check-repo") {
    const polluted = await checkNoPluginFilesInRepo(root);
    if (polluted.length) { console.error(`Plugin files found in repo:\n${polluted.join("\n")}`); return 1; }
    console.log("✓ no plugin files in project tree");
    return 0;
  }
  console.log("usage: vanta plugins [list | install <id> | remove <id> | check-repo]");
  return 1;
}

/** `vanta taste [add <url|path> [tags...] | eval <desc> | search <q> | list]` */
export async function runTasteCommand(_root: string, rest: string[]): Promise<number> {
  const { ingestAsset, loadAssets, formatAssets, searchAssets } = await import("../taste/asset-index.js");
  const { evaluateTaste } = await import("../taste/engine.js");
  const sub = rest[0] ?? "list";
  if (sub === "add") {
    const source = rest[1];
    if (!source) { console.error("usage: vanta taste add <url|path> [tags...]"); return 1; }
    const tags = rest.slice(2) as Parameters<typeof ingestAsset>[0]["tags"];
    const a = await ingestAsset({ source, tags, env: process.env });
    console.log(`✓ ingested ${a.id}: ${a.title}`);
    return 0;
  }
  if (sub === "eval") {
    const desc = rest.slice(1).join(" ").trim();
    if (!desc) { console.error("usage: vanta taste eval <description>"); return 1; }
    const v = await evaluateTaste(desc, process.env);
    console.log(`[${v.recommendation}] ${v.reason}`);
    return 0;
  }
  if (sub === "search") {
    const results = await searchAssets(rest.slice(1).join(" "), process.env);
    console.log(formatAssets(results));
    return 0;
  }
  console.log(formatAssets(await loadAssets(process.env)));
  return 0;
}

/** `vanta models [bench]` */
export async function runModelsCommand(_root: string, rest: string[]): Promise<number> {
  const sub = rest[0] ?? "bench";
  if (sub === "bench") {
    const { loadBenchResults, formatBenchScorecard } = await import("../bench/model-bench.js");
    const results = await loadBenchResults(process.env);
    console.log(formatBenchScorecard(results));
    return 0;
  }
  console.log("usage: vanta models bench");
  return 1;
}

/** `vanta acp serve` — real spec-compliant ACP stdio JSON-RPC server (Zed/editor). */
export async function runAcpServeCommand(root: string): Promise<number> {
  const { runAcpServeCommand: serve } = await import("../acp/serve.js");
  return serve(root);
}

/** `vanta acp [serve | <port>]` — ACP server. `serve` = stdio; a port = the HTTP shim. */
export async function runAcpCommand(root: string, rest: string[]): Promise<number> {
  if (rest[0] === "serve") return runAcpServeCommand(root);
  if (rest[0] === "connect") {
    const { runAcpConnect } = await import("./acp-connect.js");
    return runAcpConnect(root, rest.slice(1));
  }
  const port = Number(rest[0]) || 7792;
  const { startAcpServer, writeAgentJson } = await import("../acp/server.js");
  const { prepareRun, buildSummarizer } = await import("../session.js");
  const { runAgent } = await import("../agent.js");
  const setup = await prepareRun(root, "acp session").catch(() => null);
  if (!setup) { console.error("vanta acp: failed to initialize"); return 1; }
  await writeAgentJson(root).catch(() => {});
  const run = async (instruction: string): Promise<string> => {
    const outcome = await runAgent(setup.systemPrompt, instruction, {
      provider: setup.provider,
      safety: setup.safety,
      registry: setup.registry,
      root,
      requestApproval: async () => false,
      summarize: buildSummarizer(setup.provider),
    });
    return outcome.finalText;
  };
  const srv = await startAcpServer({ port, repoRoot: root, run });
  console.log(`vanta acp: ACP server on http://127.0.0.1:${srv.port}`);
  console.log(`  agent.json at ${root}/agent.json`);
  console.log("  Ctrl+C to stop.");
  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => { srv.close(); resolve(); });
    process.once("SIGTERM", () => { srv.close(); resolve(); });
  });
  return 0;
}

/** `vanta proxy [port]` — OpenAI-compatible proxy */
export async function runProxyCommand(_root: string, rest: string[]): Promise<number> {
  const port = Number(rest[0]) || 7791;
  const { startProxyServer } = await import("../proxy/server.js");
  const srv = await startProxyServer(port, process.env);
  console.log(`vanta proxy: OpenAI-compatible endpoint on http://127.0.0.1:${srv.port}`);
  console.log(`  OPENAI_API_KEY=vanta OPENAI_BASE_URL=http://127.0.0.1:${srv.port}/v1`);
  console.log("  Ctrl+C to stop.");
  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => { srv.close(); resolve(); });
    process.once("SIGTERM", () => { srv.close(); resolve(); });
  });
  return 0;
}

export { runRefCommand, runSettingsCommand, runBriefCommand } from "./extra-cmds-2.js";
