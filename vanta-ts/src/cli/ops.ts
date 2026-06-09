import { join } from "node:path";
import { runAgent } from "../agent.js";
import { runGateway } from "../gateway/run.js";
import { TelegramAdapter, parseAllowlist } from "../gateway/platforms/telegram.js";
import { resolveDeliver } from "../gateway/webhook.js";
import { installService, uninstallService, serviceStatus } from "../service/manager.js";
import { resolveVantaHome } from "../store/home.js";
import { prepareRun, buildSummarizer, writeRunMemory } from "../session.js";
import type { RunTask } from "../schedule/runner.js";

// Operational subcommands (gateway / service / mcp / roadmap / factory + the
// non-interactive cron task). Extracted from cli.ts to keep each file <300.
// cli.ts owns the interactive + run/skill/room paths and the main() dispatch.

export const dataDirFor = (repoRoot: string): string => join(repoRoot, ".vanta");

// Non-interactive task runner for `vanta cron` / gateway: approvals denied (no TTY).
export function buildCronRunTask(repoRoot: string): RunTask {
  return async (instruction) => {
    const setup = await prepareRun(repoRoot, instruction);
    const outcome = await runAgent(setup.systemPrompt, instruction, {
      provider: setup.provider,
      safety: setup.safety,
      registry: setup.registry,
      root: repoRoot,
      requestApproval: async () => false,
      maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
      summarize: buildSummarizer(setup.provider),
    });
    await writeRunMemory({ provider: setup.provider, goals: setup.goals, instruction, finalText: outcome.finalText });
    return { finalText: outcome.finalText };
  };
}

// `vanta gateway` — run the cron scheduler as a foreground daemon (the long-lived
// process that fires scheduled tasks without an external trigger).
export async function runGatewayCommand(repoRoot: string): Promise<void> {
  const runTask = buildCronRunTask(repoRoot);
  const token = process.env.VANTA_TELEGRAM_TOKEN;
  const platform = token
    ? new TelegramAdapter({ token, allow: parseAllowlist(process.env.VANTA_TELEGRAM_ALLOW) })
    : undefined;
  const handle = async (text: string): Promise<string> => (await runTask(text)).finalText;

  const port = Number(process.env.VANTA_WEBHOOK_PORT);
  const webhook = port
    ? {
        port,
        secret: process.env.VANTA_WEBHOOK_SECRET,
        prompt: (body: string) =>
          (process.env.VANTA_WEBHOOK_PROMPT ??
            "Handle this inbound webhook event and summarize what happened:\n{body}").replace(
            "{body}",
            body.slice(0, 4000),
          ),
        deliver: resolveDeliver(
          process.env.VANTA_WEBHOOK_DELIVER ?? "local",
          platform ? (chatId, text) => platform.send({ chatId, text }) : undefined,
        ),
      }
    : undefined;

  await runGateway({
    dataDir: dataDirFor(repoRoot),
    run: runTask,
    platform,
    handle,
    webhook,
    home: resolveVantaHome(),
    tickMs: Number(process.env.VANTA_GATEWAY_TICK_MS) || undefined,
  });
}

// `vanta service install|uninstall|status` — manage the background launchd agent.
export async function runServiceCommand(repoRoot: string, rest: string[]): Promise<void> {
  const sub = rest[0] ?? "status";
  try {
    if (sub === "install") {
      const path = await installService(repoRoot);
      console.log(`Service installed and loaded: ${path}`);
      console.log(`Logs: ${join(resolveVantaHome(), "gateway.log")}`);
      return;
    }
    if (sub === "uninstall") {
      await uninstallService();
      return void console.log("Service uninstalled.");
    }
    if (sub === "status") {
      const s = await serviceStatus();
      console.log(
        `platform ${s.platform} · installed ${s.installed ? "yes" : "no"} · running ${s.running ? "yes" : "no"}`,
      );
      return void console.log(s.plistPath);
    }
    console.log("Usage: vanta service install | uninstall | status");
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

export async function runMcpCommand(repoRoot: string, rest: string[]): Promise<void> {
  const sub = rest[0] ?? "list";

  if (sub === "serve") {
    // CRITICAL: stdout carries the JSON-RPC stream only. Re-route every stdout
    // logger (kernel launcher, mcp mount, etc.) to stderr before anything runs,
    // else the first diagnostic line corrupts the protocol and the handshake dies.
    console.log = console.error;
    const { ensureKernel } = await import("../kernel-launcher.js");
    const { SafetyClient } = await import("../safety-client.js");
    const { buildRegistry } = await import("../tools/index.js");
    const { resolveServeAllowlist, runMcpServer, stdioServerTransport } = await import("../mcp/server.js");

    const baseUrl = process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
    const kernelBin = join(repoRoot, "target", "debug", "vanta-kernel");
    await ensureKernel({ baseUrl, kernelBin, root: repoRoot });

    const safety = new SafetyClient(baseUrl);
    const registry = buildRegistry();
    const allowlist = resolveServeAllowlist(process.env);
    // Headless: no human to prompt, so self-checks (overwrite, new domain) deny.
    const ctx = { root: repoRoot, safety, requestApproval: async () => false };
    console.error(`vanta mcp serve — ${allowlist.size} tool(s) exposed, kernel-gated`);
    await runMcpServer(stdioServerTransport(), { registry, safety, ctx, allowlist });
    return;
  }

  // default: list configured MCP servers Vanta would consume (MCP-1 side)
  const { readMcpConfig } = await import("../mcp/mount.js");
  const cfg = await readMcpConfig(process.env).catch(() => ({ servers: {} }));
  const names = Object.keys(cfg.servers);
  if (names.length === 0) {
    console.log("  (no MCP servers — set VANTA_MCP_SERVERS, ./.mcp.json, or ~/.vanta/mcp.json)");
  } else {
    for (const n of names) console.log(`  ${n}`);
  }
}

export async function runRoadmapCommand(repoRoot: string, args: string[] = []): Promise<void> {
  if (args[0] === "serve") {
    const port = Number(process.env.VANTA_ROADMAP_PORT) || 7789;
    const [{ serveRoadmap }, { buildRoadmap }, { execSync }] = await Promise.all([
      import("../roadmap/server.js"),
      import("../roadmap/build.js"),
      import("node:child_process"),
    ]);
    await buildRoadmap(repoRoot);
    setTimeout(() => {
      try {
        execSync(`open "http://localhost:${port}/roadmap/board"`);
      } catch {}
    }, 300);
    await serveRoadmap(repoRoot, port);
    return;
  }

  if (args[0] === "move") {
    const id = args[1];
    const status = args[2];
    if (!id || !status) {
      console.error("Usage: vanta roadmap move <id> <status>");
      console.error("  status: shipped | building | next | horizon");
      process.exit(1);
    }
    const { moveRoadmapItem } = await import("../roadmap/move.js");
    const { STATUS } = await import("../roadmap/schema.js");
    if (!(STATUS as readonly string[]).includes(status)) {
      console.error(`Invalid status '${status}'. Valid: ${STATUS.join(", ")}`);
      process.exit(1);
    }
    const item = await moveRoadmapItem(repoRoot, id, status as import("../roadmap/schema.js").Status);
    console.log(`  ✓ Moved ${item.id} → ${status}: ${item.title}`);
    return;
  }

  if (args[1] === "decompose") {
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
    return;
  }

  const { buildRoadmap } = await import("../roadmap/build.js");
  const { execSync } = await import("node:child_process");
  const htmlPath = await buildRoadmap(repoRoot);
  execSync(`open "${htmlPath}"`);
  console.log(`  → opened ${htmlPath}`);
}

export async function runDesktopCommand(repoRoot: string, rest: string[]): Promise<void> {
  const port = Number(rest[0] ?? process.env.VANTA_DESKTOP_PORT) || 7790;
  const { serveDesktop } = await import("../desktop/server.js");
  setTimeout(() => {
    void import("node:child_process").then(({ execSync }) => {
      try { execSync(`open "http://127.0.0.1:${port}"`); } catch {}
    });
  }, 300);
  await serveDesktop(repoRoot, port);
}

export async function runFactoryCommand(repoRoot: string, sub: string): Promise<void> {
  const { runCycle, formatCycleLog, resolveAutonomyLevel } = await import("../factory/run.js");
  const budget = Number(process.env.VANTA_FACTORY_BUDGET) || 80_000;
  const dataDir = resolveVantaHome(process.env);

  if (sub === "approve") {
    // L4 by default (commit + push); VANTA_AUTONOMY_LEVEL=2|3 stops earlier.
    const autonomyLevel = resolveAutonomyLevel("approve", process.env);
    const result = await runCycle(
      { vantaRoot: repoRoot, dataDir, autonomyLevel, budgetTokens: budget, interactive: true },
      console.log,
    );
    console.log(`\n${formatCycleLog(result)}`);
    return;
  }

  if (sub === "status") {
    const { access, readFile } = await import("node:fs/promises");
    const locked = await access(join(dataDir, "factory.lock")).then(() => true).catch(() => false);
    console.log(locked ? "factory: RUNNING (lockfile present)" : "factory: idle");
    const logDir = join(dataDir, "logs");
    try {
      const { readdirSync } = await import("node:fs");
      const logs = readdirSync(logDir).filter((f: string) => f.startsWith("factory-")).sort().reverse();
      if (logs[0]) {
        const last = await readFile(join(logDir, logs[0]!), "utf8");
        console.log(`last cycle: ${last.trim().split("\n").at(-1) ?? ""}`);
      }
    } catch { /* no logs yet */ }
    return;
  }

  if (sub === "review" || sub === "") {
    // vanta improve or vanta factory (no sub): L1 suggest — print plan, don't execute
    const result = await runCycle(
      { vantaRoot: repoRoot, dataDir, autonomyLevel: 1, budgetTokens: budget, interactive: true },
      console.log,
    );
    console.log(`\n${formatCycleLog(result)}`);
    return;
  }

  console.log("Usage: vanta factory [approve|status]");
}

/** `vanta pairing [list | approve <chatId>]` — manage messaging platform pairings. */
export async function runPairingCommand(rest: string[]): Promise<void> {
  const home = resolveVantaHome();
  const { listPairings, approvePairing } = await import("../gateway/pairing.js");
  const sub = rest[0] ?? "list";

  if (sub === "approve") {
    const chatId = rest[1];
    if (!chatId) { console.error("usage: vanta pairing approve <chatId>"); process.exit(1); }
    const ok = await approvePairing(chatId, "cli", home);
    console.log(ok ? `✓ approved: ${chatId}` : `not found: ${chatId}`);
    return;
  }

  const records = await listPairings(home);
  if (!records.length) { console.log("(no pairing records)"); return; }
  for (const r of records) {
    const age = r.status === "approved"
      ? `approved ${new Date(r.approvedAt ?? r.issuedAt).toISOString()}`
      : `expires ${new Date(r.expiresAt).toISOString()} · ${r.attempts} attempt(s)`;
    console.log(`${r.platform.padEnd(10)} ${r.chatId.padEnd(20)} [${r.status}]  ${age}`);
  }
}

/** `vanta config [show | edit | migrate]` — manage Vanta configuration. */
export async function runConfigCommand(repoRoot: string, rest: string[]): Promise<void> {
  const sub = rest[0] ?? "show";
  const { showConfig, editConfig, migrateConfig } = await import("../cli-dx/config.js");

  try {
    if (sub === "show") {
      await showConfig(repoRoot);
      return;
    }
    if (sub === "edit") {
      await editConfig(repoRoot);
      return;
    }
    if (sub === "migrate") {
      await migrateConfig(repoRoot);
      return;
    }
    console.error("Usage: vanta config [show | edit | migrate]");
    process.exit(1);
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
