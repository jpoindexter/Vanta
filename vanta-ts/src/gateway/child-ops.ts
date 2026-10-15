import { join } from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import type { PlatformAdapter } from "./platforms/base.js";
import { startWebhookServer, type Deliver, type WebhookServer } from "./webhook.js";
import { wakeContextForWebhook, wakeEnv, withWakeContext } from "../loop/wake.js";
import type { WakeContext } from "../loop/types.js";
import { buildSafeChildEnv } from "../exec/child-env.js";
import {
  executeEffect,
  payloadSha256,
  stableEffectId,
  type EffectGateContext,
  type EffectIntent,
} from "../effects/execute-effect.js";
import { sendGatewayMessage } from "./effect-send.js";

function childIntent(kind: string, target: string, idempotencyKey: string): EffectIntent {
  const seed = {
    host: "gateway",
    kind,
    targetClass: "local-child-process",
    payloadSha256: payloadSha256(target),
    idempotencyKey,
  };
  return {
    id: stableEffectId(seed),
    actor: "gateway",
    action: `${kind} for ${target}`,
    ...seed,
  };
}

export async function spawnLoopChild(
  id: string,
  log: (msg: string) => void,
  wake: WakeContext | undefined,
  effectGate: EffectGateContext | undefined,
): Promise<void> {
  if (!effectGate) throw new Error("blocked: loop launch effect gate unavailable");
  const wakeHash = payloadSha256(JSON.stringify(wake ?? null));
  const result = await executeEffect(
    childIntent("gateway.loop.launch", id, `loop:${id}:${wakeHash}`),
    effectGate,
    async () => {
      const child = spawn("vanta", ["loop", "run", id], {
        detached: true,
        stdio: "ignore",
        env: wakeEnv(wake),
      });
      child.unref();
      return { value: child.pid, acknowledgementId: child.pid ? String(child.pid) : undefined };
    },
  );
  if (result.outcome !== "confirmed" && result.outcome !== "verified") {
    throw new Error(`loop ${id}: launch ${result.outcome}`);
  }
  log(`loop ${id}: spawned detached iteration (pid ${result.value ?? "unknown"})`);
}

export async function spawnFactoryChild(
  dataDir: string,
  log: (msg: string) => void,
  effectGate: EffectGateContext | undefined,
): Promise<void> {
  if (existsSync(join(dataDir, "factory.lock"))) {
    log("factory: already running (lockfile present) — skipping gateway spawn");
    return;
  }
  if (!effectGate) throw new Error("blocked: factory launch effect gate unavailable");
  const result = await executeEffect(
    childIntent("gateway.factory.launch", dataDir, `factory:${payloadSha256(dataDir)}`),
    effectGate,
    async () => {
      const child = spawn("vanta", ["factory", "approve"], {
        detached: true,
        stdio: "ignore",
        env: buildSafeChildEnv(process.env),
      });
      child.unref();
      return { value: child.pid, acknowledgementId: child.pid ? String(child.pid) : undefined };
    },
  );
  if (result.outcome !== "confirmed" && result.outcome !== "verified") {
    throw new Error(`factory launch ${result.outcome}`);
  }
  log(`factory: spawned detached cycle (pid ${result.value ?? "unknown"})`);
}

type PairingDeps = {
  m: import("./platforms/base.js").InboundMessage;
  platform: PlatformAdapter;
  handle: (text: string) => Promise<string>;
  home: string;
  log: (msg: string) => void;
  effectGate?: EffectGateContext;
};

async function handleWithPairing(opts: PairingDeps): Promise<void> {
  const { m, platform, handle, home, log } = opts;
  const { isApproved, requestPairing, verifyCode, looksLikeCode } = await import("./pairing.js");
  if (await isApproved(m.chatId, home)) {
    let reply: string;
    try { reply = await handle(m.text); }
    catch (err) { reply = `error: ${err instanceof Error ? err.message : String(err)}`; }
    await sendGatewayMessage({
      platform,
      gate: opts.effectGate,
      message: { chatId: m.chatId, text: reply },
      kind: "gateway.pairing",
      idempotencyKey: `${platform.id}:${m.chatId}:${m.id ?? payloadSha256(m.text)}:paired-reply`,
    });
    return;
  }
  if (looksLikeCode(m.text)) {
    const result = await verifyCode(m.chatId, m.text.trim().toUpperCase(), home);
    const replies: Record<string, string> = {
      approved: "✓ Paired. You can now send instructions.",
      expired: "Code expired. Please send any message to get a new code.",
      wrong: "Wrong code. Try again or wait for a new code.",
      locked: "Too many attempts. Ask the owner to approve you directly.",
    };
    await sendGatewayMessage({
      platform,
      gate: opts.effectGate,
      message: { chatId: m.chatId, text: replies[result] ?? "Try again." },
      kind: "gateway.pairing",
      idempotencyKey: `${platform.id}:${m.chatId}:${m.id ?? payloadSha256(m.text)}:pair-code`,
    });
    if (result === "approved") log(`  ✓ pairing approved: ${m.chatId} on ${platform.id}`);
    return;
  }
  const code = await requestPairing(m.chatId, platform.id, home);
  log(`  ⏳ pairing requested: ${m.chatId} on ${platform.id}`);
  await sendGatewayMessage({
    platform,
    gate: opts.effectGate,
    message: { chatId: m.chatId, text: `Vanta requires pairing. Your code is: ${code}\n\nReply with this code to connect (valid 1 hour).` },
    kind: "gateway.pairing",
    idempotencyKey: `${platform.id}:${m.chatId}:${m.id ?? payloadSha256(m.text)}:pair-request`,
  });
}

type GatewayPollDeps = {
  platform?: PlatformAdapter;
  handle?: (text: string) => Promise<string>;
  home?: string;
  log?: (msg: string) => void;
  effectGate?: EffectGateContext;
};

function firstLine(text: string): string {
  const line = text.split("\n")[0] ?? "";
  return line.length > 100 ? `${line.slice(0, 97)}...` : line;
}

export async function pollPlatform(deps: GatewayPollDeps): Promise<number> {
  if (!deps.platform || !deps.handle) return 0;
  const log = deps.log ?? ((m: string) => console.log(m));
  const messages = await deps.platform.poll();
  for (const m of messages) {
    log(`  ✉ ${deps.platform.id} ${m.from ?? m.chatId}: ${firstLine(m.text)}`);
    if (deps.home) {
      await handleWithPairing({ m, platform: deps.platform, handle: deps.handle, home: deps.home, log, effectGate: deps.effectGate }).catch((err) => {
        log(`  pairing error: ${err instanceof Error ? err.message : String(err)}`);
      });
    } else {
      let reply: string;
      try { reply = await deps.handle(m.text); }
      catch (err) { reply = `error: ${err instanceof Error ? err.message : String(err)}`; }
      await sendGatewayMessage({
        platform: deps.platform,
        gate: deps.effectGate,
        message: { chatId: m.chatId, text: reply },
        kind: "gateway.final",
        idempotencyKey: `${deps.platform.id}:${m.chatId}:${m.id ?? payloadSha256(m.text)}:legacy-final`,
      });
    }
  }
  return messages.length;
}

type WebhookConfig = {
  port: number;
  secret?: string;
  prompt: (body: string) => string;
  deliver: Deliver;
};

export async function startWebhookIfConfigured(
  webhook: WebhookConfig | undefined,
  handle: ((text: string) => Promise<string>) | undefined,
  log: (m: string) => void,
  effectGate?: EffectGateContext,
): Promise<WebhookServer | undefined> {
  if (!webhook || !handle) return undefined;
  const { prompt, deliver } = webhook;
  return startWebhookServer({
    port: webhook.port,
    secret: webhook.secret,
    log,
    onEvent: async (body) => {
      const text = withWakeContext(prompt(body), wakeContextForWebhook(body));
      const reply = await handle(text);
      if (!effectGate) throw new Error("blocked: webhook delivery effect gate unavailable");
      const bodyHash = payloadSha256(body);
      const seed = {
        host: "gateway:webhook",
        kind: "gateway.webhook",
        targetClass: "configured-delivery-target",
        payloadSha256: payloadSha256(reply),
        idempotencyKey: `webhook:${bodyHash}`,
      };
      const outcome = await executeEffect({
        id: stableEffectId(seed),
        actor: "gateway",
        action: "deliver an authenticated webhook result to its configured target",
        ...seed,
      }, effectGate, async () => {
        await deliver(reply);
        return {};
      });
      if (outcome.outcome !== "confirmed" && outcome.outcome !== "verified") {
        throw new Error(`webhook delivery ${outcome.outcome}`);
      }
    },
  }).catch((err: unknown) => {
    log(`vanta gateway: webhook listener failed — ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  });
}
