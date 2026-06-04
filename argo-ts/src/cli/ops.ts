import { join } from "node:path";
import { runAgent } from "../agent.js";
import { runGateway } from "../gateway/run.js";
import { TelegramAdapter, parseAllowlist } from "../gateway/platforms/telegram.js";
import { resolveDeliver } from "../gateway/webhook.js";
import { installService, uninstallService, serviceStatus } from "../service/manager.js";
import { resolveArgoHome } from "../store/home.js";
import { prepareRun, buildSummarizer, writeRunMemory } from "../session.js";
import type { RunTask } from "../schedule/runner.js";

// Operational subcommands (gateway / service / mcp / roadmap / factory + the
// non-interactive cron task). Extracted from cli.ts to keep each file <300.
// cli.ts owns the interactive + run/skill/room paths and the main() dispatch.

export const dataDirFor = (repoRoot: string): string => join(repoRoot, ".argo");

// Non-interactive task runner for `argo cron` / gateway: approvals denied (no TTY).
export function buildCronRunTask(repoRoot: string): RunTask {
  return async (instruction) => {
    const setup = await prepareRun(repoRoot, instruction);
    const outcome = await runAgent(setup.systemPrompt, instruction, {
      provider: setup.provider,
      safety: setup.safety,
      registry: setup.registry,
      root: repoRoot,
      requestApproval: async () => false,
      maxIterations: Number(process.env.ARGO_MAX_ITER) || undefined,
      summarize: buildSummarizer(setup.provider),
    });
    await writeRunMemory(setup.provider, setup.goals, instruction, outcome.finalText);
    return { finalText: outcome.finalText };
  };
}

// `argo gateway` — run the cron scheduler as a foreground daemon (the long-lived
// process that fires scheduled tasks without an external trigger).
export async function runGatewayCommand(repoRoot: string): Promise<void> {
  const runTask = buildCronRunTask(repoRoot);
  const token = process.env.ARGO_TELEGRAM_TOKEN;
  const platform = token
    ? new TelegramAdapter({ token, allow: parseAllowlist(process.env.ARGO_TELEGRAM_ALLOW) })
    : undefined;
  const handle = async (text: string): Promise<string> => (await runTask(text)).finalText;

  const port = Number(process.env.ARGO_WEBHOOK_PORT);
  const webhook = port
    ? {
        port,
        secret: process.env.ARGO_WEBHOOK_SECRET,
        prompt: (body: string) =>
          (process.env.ARGO_WEBHOOK_PROMPT ??
            "Handle this inbound webhook event and summarize what happened:\n{body}").replace(
            "{body}",
            body.slice(0, 4000),
          ),
        deliver: resolveDeliver(
          process.env.ARGO_WEBHOOK_DELIVER ?? "local",
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
    tickMs: Number(process.env.ARGO_GATEWAY_TICK_MS) || undefined,
  });
}

// `argo service install|uninstall|status` — manage the background launchd agent.
export async function runServiceCommand(repoRoot: string, rest: string[]): Promise<void> {
  const sub = rest[0] ?? "status";
  try {
    if (sub === "install") {
      const path = await installService(repoRoot);
      console.log(`Service installed and loaded: ${path}`);
      console.log(`Logs: ${join(resolveArgoHome(), "gateway.log")}`);
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
    console.log("Usage: argo service install | uninstall | status");
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

    const baseUrl = process.env.ARGO_KERNEL_URL ?? "http://127.0.0.1:7788";
    const kernelBin = join(repoRoot, "target", "debug", "argo-kernel");
    await ensureKernel({ baseUrl, kernelBin, root: repoRoot });

    const safety = new SafetyClient(baseUrl);
    const registry = buildRegistry();
    const allowlist = resolveServeAllowlist(process.env);
    // Headless: no human to prompt, so self-checks (overwrite, new domain) deny.
    const ctx = { root: repoRoot, safety, requestApproval: async () => false };
    console.error(`argo mcp serve — ${allowlist.size} tool(s) exposed, kernel-gated`);
    await runMcpServer(stdioServerTransport(), { registry, safety, ctx, allowlist });
    return;
  }

  // default: list configured MCP servers Argo would consume (MCP-1 side)
  const { readMcpConfig } = await import("../mcp/mount.js");
  const cfg = await readMcpConfig(process.env).catch(() => ({ servers: {} }));
  const names = Object.keys(cfg.servers);
  if (names.length === 0) {
    console.log("  (no MCP servers — set ARGO_MCP_SERVERS, ./.mcp.json, or ~/.argo/mcp.json)");
  } else {
    for (const n of names) console.log(`  ${n}`);
  }
}

export async function runRoadmapCommand(repoRoot: string, args: string[] = []): Promise<void> {
  if (args[0] === "move") {
    const id = args[1];
    const status = args[2];
    if (!id || !status) {
      console.error("Usage: argo roadmap move <id> <status>");
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

  const { buildRoadmap } = await import("../roadmap/build.js");
  const { execSync } = await import("node:child_process");
  const htmlPath = await buildRoadmap(repoRoot);
  execSync(`open "${htmlPath}"`);
  console.log(`  → opened ${htmlPath}`);
}

export async function runFactoryCommand(repoRoot: string, sub: string): Promise<void> {
  const { runCycle, formatCycleLog, resolveAutonomyLevel } = await import("../factory/run.js");
  const budget = Number(process.env.ARGO_FACTORY_BUDGET) || 80_000;
  const dataDir = resolveArgoHome(process.env);

  if (sub === "approve") {
    // L4 by default (commit + push); ARGO_AUTONOMY_LEVEL=2|3 stops earlier.
    const autonomyLevel = resolveAutonomyLevel("approve", process.env);
    const result = await runCycle(
      { argoRoot: repoRoot, dataDir, autonomyLevel, budgetTokens: budget, interactive: true },
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
    // argo improve or argo factory (no sub): L1 suggest — print plan, don't execute
    const result = await runCycle(
      { argoRoot: repoRoot, dataDir, autonomyLevel: 1, budgetTokens: budget, interactive: true },
      console.log,
    );
    console.log(`\n${formatCycleLog(result)}`);
    return;
  }

  console.log("Usage: argo factory [approve|status]");
}
