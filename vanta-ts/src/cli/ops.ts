import { join } from "node:path";
import { runAgent } from "../agent.js";
import type { ImageAttachment } from "../types.js";
import { buildMediaBridgeDeps } from "../gateway/media-deps.js";
import { runGateway } from "../gateway/run.js";
import type { PlatformAdapter } from "../gateway/platforms/base.js";
import { resolveMessagingChannel } from "../gateway/platforms/factory.js";
import { resolveDeliver } from "../gateway/webhook.js";
import { installService, uninstallService, serviceStatus } from "../service/manager.js";
import { resolveVantaHome } from "../store/home.js";
import { prepareRun, buildSummarizer, writeRunMemory } from "../session.js";
import type { RunTask } from "../schedule/runner.js";
import { withWakeContext, wakeContextFromEnv } from "../loop/wake.js";
import { estimateCostUsd } from "../pricing.js";
import { enforceScopeBudget, scopeForLoop } from "../budget/enforce.js";
import { recordTurnSpend } from "../cost/ledger.js";

// Operational subcommands (gateway / service / mcp / factory + the
// non-interactive cron task). Extracted from cli.ts to keep each file <300.
// cli.ts owns the interactive + run/skill/room paths and the main() dispatch.
// runRoadmapCommand lives in roadmap-cmd.ts (CODE-SIZE-GATE).
export { runRoadmapCommand } from "./roadmap-cmd.js";
// Desktop/factory/pairing/config handlers live in ops-app.ts (size gate).
export { runDesktopCommand, runFactoryCommand, runPairingCommand, runConfigCommand } from "./ops-app.js";

export const dataDirFor = (repoRoot: string): string => join(repoRoot, ".vanta");

// `vanta plugin list|enable|disable|install|uninstall` — manage the runtime
// in-process plugin set under ~/.vanta/plugins. Distinct from `vanta plugins`
// (the optional-capability catalog). enable/disable edit settings.plugins.enabled
// (the loader's allow-list); install copies a local plugin dir in + validates.
export async function runPluginCommand(repoRoot: string, rest: string[]): Promise<number> {
  const { runPlugin } = await import("./plugin-cmd.js");
  return runPlugin(repoRoot, rest);
}

// `vanta dept add|list|status|assign` — departments as first-class org units
// (roster + `dept:<id>` budget scope + standing goal subset). Binds the existing
// team/budget/goal primitives; does not duplicate them.
export async function runDeptCommand(repoRoot: string, rest: string[]): Promise<number> {
  const { runDeptCommand: run } = await import("./dept-cmd.js");
  return run(repoRoot, rest);
}

// `vanta library list [--dept <id>] [--approved|--pending]` — the company
// Library: completed department tasks land as durable, provenance-tagged
// artifacts (work products), queryable by department + approval state.
export async function runLibraryCommand(repoRoot: string, rest: string[]): Promise<number> {
  const { runLibraryCommand: run } = await import("./library-cmd.js");
  return run(repoRoot, rest);
}

// Non-interactive task runner for `vanta cron` / gateway: approvals denied (no
// TTY) — unless CHANNEL-PERMISSIONS-WIRE passes a channel approver, which
// relays ask-tier actions to the configured approver chat and races the reply
// against a deny-at-timeout.
export function buildCronRunTask(
  repoRoot: string,
  opts: { requestApproval?: (action: string, reason: string, toolName?: string) => Promise<boolean> } = {},
): RunTask {
  return async (instruction, wake, images) => {
    const prompt = withWakeContext(instruction, wake);
    const setup = await prepareRun(repoRoot, prompt);
    const outcome = await runAgent(setup.systemPrompt, prompt, {
      provider: setup.provider,
      safety: setup.safety,
      registry: setup.registry,
      root: repoRoot,
      requestApproval: opts.requestApproval ?? (async () => false),
      maxIterations: Number(process.env.VANTA_MAX_ITER) || undefined,
      summarize: buildSummarizer(setup.provider),
    }, images); // MSG-MEDIA-IMAGES: inbound images reach the agent's vision
    await writeRunMemory({ provider: setup.provider, goals: setup.goals, instruction: prompt, finalText: outcome.finalText });
    // Budget hard-stop: attribute this run's cost to its scope (a loop when run
    // under a loop wake, else the session). enforceScopeBudget is a no-op unless a
    // budget is set, and auto-pauses + cancels queued work on overspend.
    const usage = outcome.usage;
    const cost = usage ? estimateCostUsd(setup.provider.modelId(), usage.inputTokens, usage.outputTokens) : null;
    if (cost && cost > 0) {
      // Attribute to the loop when run under a loop wake (gateway sets the wake
      // env on the spawned child); otherwise the session scope.
      const wakeCtx = wake ?? wakeContextFromEnv();
      const scope = wakeCtx?.goal_id ? scopeForLoop(wakeCtx.goal_id) : "session";
      await enforceScopeBudget({ dataDir: dataDirFor(repoRoot), scope, deltaUsd: cost }).catch(() => {});
      // PCLIP-COST-ATTRIBUTION: persist the priced run for /usage breakdowns.
      await recordTurnSpend(dataDirFor(repoRoot), {
        costUsd: cost,
        provider: process.env.VANTA_PROVIDER ?? "unknown",
        model: setup.provider.modelId(),
        inputTokens: usage!.inputTokens,
        outputTokens: usage!.outputTokens,
        agent: "gateway",
        goal: wakeCtx?.goal_id,
      });
    }
    return { finalText: outcome.finalText };
  };
}

// CHANNEL-PERMISSIONS-WIRE — opt-in: with VANTA_APPROVER_CHATS set and a live
// channel, ask-tier approvals relay to the first approver chat and an
// allowlisted "yes/no <id>" reply resolves them (raced vs deny-at-timeout).
async function buildGatewayApprover(platform: PlatformAdapter | undefined): Promise<{
  replyBus?: import("../permissions/reply-bus.js").ReplyBus;
  requestApproval?: (action: string, reason: string, toolName?: string) => Promise<boolean>;
}> {
  const { resolveApproverChats, approvalTimeoutMs, buildChannelApprover } = await import("../permissions/channel-approver.js");
  const { createReplyBus } = await import("../permissions/reply-bus.js");
  const approverChats = resolveApproverChats(process.env);
  if (!approverChats.length || !platform) return {};
  const replyBus = createReplyBus();
  const requestApproval = buildChannelApprover({
    send: (text, buttons) => platform.send({ chatId: approverChats[0]!, text, buttons }),
    bus: replyBus,
    allowlist: approverChats,
    timeoutMs: approvalTimeoutMs(process.env),
    poll: () => platform.poll(),
    log: (m) => console.log(`  ${m}`),
  });
  return { replyBus, requestApproval };
}

// `vanta gateway` — run the cron scheduler as a foreground daemon (the long-lived
// process that fires scheduled tasks without an external trigger).
export async function runGatewayCommand(repoRoot: string): Promise<void> {
  const platform = resolveMessagingChannel(process.env); // MSG-MULTICHANNEL-LIVE: run all configured channels

  const { replyBus, requestApproval } = await buildGatewayApprover(platform);
  const runTask = buildCronRunTask(repoRoot, { requestApproval });
  const handle = async (text: string, images?: ImageAttachment[]): Promise<string> =>
    (await runTask(text, undefined, images)).finalText;

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
    replyBus,
    media: buildMediaBridgeDeps(), // MSG-MEDIA-IMAGES: inbound image→vision, voice→STT
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

  if (sub === "catalog") { await runMcpCatalog(); return; }
  if (sub === "install") { await runMcpInstall(rest.slice(1)); return; }
  if (sub === "import-desktop") { await runMcpImportDesktop(); return; }

  // default: list configured MCP servers Vanta would consume (MCP-1 side)
  const { readMcpConfig } = await import("../mcp/mount.js");
  const cfg = await readMcpConfig(process.env).catch(() => ({ servers: {} }));
  const names = Object.keys(cfg.servers);
  if (names.length === 0) {
    console.log("  (no MCP servers — set VANTA_MCP_SERVERS, ./.mcp.json, or ~/.vanta/mcp.json; or `vanta mcp catalog`)");
  } else {
    for (const n of names) console.log(`  ${n}`);
  }
}

/** EXT-MCP-CATALOG — print the vetted catalog. */
async function runMcpCatalog(): Promise<void> {
  const { MCP_CATALOG } = await import("../mcp/catalog.js");
  console.log("Vetted MCP servers (vanta mcp install <name>):");
  for (const e of MCP_CATALOG) {
    console.log(`  ${e.name} — ${e.description}`);
    console.log(`    default tools (read-mostly): ${e.defaultTools.join(", ")}`);
    if (e.optInTools?.length) console.log(`    opt-in (--with-tool <name>): ${e.optInTools.join(", ")}`);
  }
}

async function runMcpImportDesktop(): Promise<void> {
  const { importDesktopMcp } = await import("../mcp/desktop-import.js");
  const r = await importDesktopMcp();
  if (!r.ok) { console.log(`  ${r.error}`); return; }
  console.log(`  imported ${r.imported.length}, skipped ${r.skipped.length} → ${r.targetPath}`);
  if (r.imported.length > 0) console.log(`  imported: ${r.imported.join(", ")}`);
  if (r.skipped.length > 0) console.log(`  skipped (already present): ${r.skipped.join(", ")}`);
}

/** EXT-MCP-CATALOG — `vanta mcp install <name> [--with-tool <t>]…` writes a vetted
 * server (read-mostly default tools) into ~/.vanta/mcp.json. */
async function runMcpInstall(rest: string[]): Promise<void> {
  const name = rest[0];
  if (!name) { console.error('usage: vanta mcp install <name> [--with-tool <tool>]…  (see `vanta mcp catalog`)'); return; }
  const { catalogEntry, buildInstallSpec, installIntoConfig } = await import("../mcp/catalog.js");
  const entry = catalogEntry(name);
  if (!entry) { console.error(`unknown MCP server "${name}" — run \`vanta mcp catalog\` for the vetted list`); return; }
  const withTools: string[] = [];
  for (let i = 1; i < rest.length; i += 1) if (rest[i] === "--with-tool" && rest[i + 1]) withTools.push(rest[++i]!);

  const built = buildInstallSpec(entry, withTools);
  if (!built.ok) { console.error(built.error); return; }

  const { writeFile, mkdir } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  const { resolveVantaHome } = await import("../store/home.js");
  const path = join(resolveVantaHome(process.env), "mcp.json");
  const merged = installIntoConfig(await readMcpJson(path), name, built.spec);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ servers: merged.servers }, null, 2)}\n`, "utf8");
  console.log(`installed "${name}" → ${path} (${built.toolCount} tool(s), read-mostly)`);
  if (entry.authEnv?.length) console.log(`  set ${entry.authEnv.join(", ")} in your env before use`);
  if (entry.optInTools?.length && !withTools.length) console.log(`  mutating tools are opt-in: reinstall with --with-tool <name> (${entry.optInTools.join(", ")})`);
}

/** Read ~/.vanta/mcp.json into the {servers} shape, tolerant of both key conventions. */
async function readMcpJson(path: string): Promise<{ servers: Record<string, import("../mcp/mount-config.js").ServerSpec> }> {
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = JSON.parse(await readFile(path, "utf8")) as { servers?: Record<string, never>; mcpServers?: Record<string, never> };
    return { servers: { ...(raw.mcpServers ?? {}), ...(raw.servers ?? {}) } };
  } catch {
    return { servers: {} };
  }
}

