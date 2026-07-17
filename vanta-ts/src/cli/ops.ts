import { join } from "node:path";
import { runAgent } from "../agent.js";
import { buildMediaBridgeDeps } from "../gateway/media-deps.js";
import { runGateway } from "../gateway/run.js";
import type { PlatformAdapter } from "../gateway/platforms/base.js";
import { resolveMessagingChannel } from "../gateway/platforms/factory.js";
import { resolveDeliver } from "../gateway/webhook.js";
import { resolveVantaHome } from "../store/home.js";
import { prepareRun, buildSummarizer, writeRunMemory } from "../session.js";
import type { RunTask } from "../schedule/runner.js";
import { withWakeContext, wakeContextFromEnv } from "../loop/wake.js";
import { estimateCostUsd } from "../pricing.js";
import { enforceScopeBudget, scopeForLoop } from "../budget/enforce.js";
import { recordTurnSpend } from "../cost/ledger.js";
import { buildGatewayHandle } from "./gateway-stream.js";
import { runGatewayUtilityCommand } from "./gateway-utility-cmd.js";

// Operational subcommands (gateway / service / mcp / factory + the
// non-interactive cron task). Extracted from cli.ts to keep each file <300.
// cli.ts owns the interactive + run/skill/room paths and the main() dispatch.
// runRoadmapCommand lives in roadmap-cmd.ts (CODE-SIZE-GATE).
export { runRoadmapCommand } from "./roadmap-cmd.js";
// Desktop/factory/pairing/config handlers live in ops-app.ts (size gate).
export { runDesktopCommand, runFactoryCommand, runPairingCommand, runConfigCommand } from "./ops-app.js";
export { runMcpCommand } from "./mcp-cmd.js";

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
  return async (instruction, wake, images, callbacks) => {
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
      ...callbacks,
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
    send: async (text, buttons) => { await platform.send({ chatId: approverChats[0]!, text, buttons }); },
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
export async function runGatewayCommand(repoRoot: string, rest: string[] = []): Promise<void> {
  if (await runGatewayUtilityCommand(repoRoot, rest)) return;
  const platform = resolveMessagingChannel(process.env); // MSG-MULTICHANNEL-LIVE: run all configured channels

  const { replyBus, requestApproval } = await buildGatewayApprover(platform);
  const runTask = buildCronRunTask(repoRoot, { requestApproval });
  const handle = buildGatewayHandle(runTask);

  const webhook = gatewayWebhook(platform);

  await runGateway({
    dataDir: dataDirFor(repoRoot),
    run: runTask,
    platform,
    handle,
    replyBus,
    media: buildMediaBridgeDeps(), // MSG-MEDIA-IMAGES: inbound image→vision, voice→STT
    contextRefs: {
      resolveScope: async () => {
        const { resolveProvider } = await import("../providers/index.js");
        return {
          root: repoRoot,
          contextWindow: resolveProvider(process.env).contextWindow(),
          scopeId: process.env.VANTA_PROFILE ?? "default",
        };
      },
    },
    webhook,
    workflowWebhooks: {
      port: Number(process.env.VANTA_WORKFLOW_WEBHOOK_PORT) || 7790,
      resolveDeliver: (target: string) => resolveDeliver(
        target,
        platform ? async (chatId, text) => { await platform.send({ chatId, text }); } : undefined,
      ),
    },
    home: resolveVantaHome(),
    tickMs: Number(process.env.VANTA_GATEWAY_TICK_MS) || undefined,
  });
}

function gatewayWebhook(platform: PlatformAdapter | undefined): Parameters<typeof runGateway>[0]["webhook"] {
  const port = Number(process.env.VANTA_WEBHOOK_PORT);
  if (!port) return undefined;
  return {
    port,
    secret: process.env.VANTA_WEBHOOK_SECRET,
    prompt: (body: string) => (process.env.VANTA_WEBHOOK_PROMPT ??
      "Handle this inbound webhook event and summarize what happened:\n{body}").replace("{body}", body.slice(0, 4000)),
    deliver: resolveDeliver(
      process.env.VANTA_WEBHOOK_DELIVER ?? "local",
      platform ? async (chatId, text) => { await platform.send({ chatId, text }); } : undefined,
    ),
  };
}
