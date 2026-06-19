import { join } from "node:path";
import { runAgent } from "../agent.js";
import { runGateway } from "../gateway/run.js";
import { resolvePlatform } from "../gateway/platforms/resolve.js";
import { resolveDeliver } from "../gateway/webhook.js";
import { installService, uninstallService, serviceStatus } from "../service/manager.js";
import { resolveVantaHome } from "../store/home.js";
import { prepareRun, buildSummarizer, writeRunMemory } from "../session.js";
import type { RunTask } from "../schedule/runner.js";
import { withWakeContext } from "../loop/wake.js";

// Operational subcommands (gateway / service / mcp / factory + the
// non-interactive cron task). Extracted from cli.ts to keep each file <300.
// cli.ts owns the interactive + run/skill/room paths and the main() dispatch.
// runRoadmapCommand lives in roadmap-cmd.ts (CODE-SIZE-GATE).
export { runRoadmapCommand } from "./roadmap-cmd.js";
// Desktop/factory/pairing/config handlers live in ops-app.ts (size gate).
export { runDesktopCommand, runFactoryCommand, runPairingCommand, runConfigCommand } from "./ops-app.js";

export const dataDirFor = (repoRoot: string): string => join(repoRoot, ".vanta");

// Non-interactive task runner for `vanta cron` / gateway: approvals denied (no TTY).
export function buildCronRunTask(repoRoot: string): RunTask {
  return async (instruction, wake) => {
    const prompt = withWakeContext(instruction, wake);
    const setup = await prepareRun(repoRoot, prompt);
    const outcome = await runAgent(setup.systemPrompt, prompt, {
      provider: setup.provider,
      safety: setup.safety,
      registry: setup.registry,
      root: repoRoot,
      requestApproval: async () => false,
      maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
      summarize: buildSummarizer(setup.provider),
    });
    await writeRunMemory({ provider: setup.provider, goals: setup.goals, instruction: prompt, finalText: outcome.finalText });
    return { finalText: outcome.finalText };
  };
}

// `vanta gateway` — run the cron scheduler as a foreground daemon (the long-lived
// process that fires scheduled tasks without an external trigger).
export async function runGatewayCommand(repoRoot: string): Promise<void> {
  const runTask = buildCronRunTask(repoRoot);
  const platform = resolvePlatform(process.env);
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
    const { createKernelClient } = await import("../kernel/client.js");
    const { buildRegistry } = await import("../tools/index.js");
    const { resolveServeAllowlist, runMcpServer, stdioServerTransport } = await import("../mcp/server.js");

    const baseUrl = process.env.VANTA_KERNEL_URL ?? "http://127.0.0.1:7788";
    const kernelBin = join(repoRoot, "target", "debug", "vanta-kernel");
    await ensureKernel({ baseUrl, kernelBin, root: repoRoot });

    const safety = createKernelClient(baseUrl);
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

