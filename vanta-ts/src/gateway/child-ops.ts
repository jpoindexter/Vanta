import { join } from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import type { PlatformAdapter } from "./platforms/base.js";
import { startWebhookServer, type Deliver, type WebhookServer } from "./webhook.js";

export function spawnLoopChild(id: string, log: (msg: string) => void): void {
  const child = spawn("vanta", ["loop", "run", id], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  log(`loop ${id}: spawned detached iteration (pid ${child.pid})`);
}

export function spawnFactoryChild(dataDir: string, log: (msg: string) => void): void {
  if (existsSync(join(dataDir, "factory.lock"))) {
    log("factory: already running (lockfile present) — skipping gateway spawn");
    return;
  }
  const child = spawn("vanta", ["factory", "approve"], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  log(`factory: spawned detached cycle (pid ${child.pid})`);
}

type PairingDeps = {
  m: import("./platforms/base.js").InboundMessage;
  platform: PlatformAdapter;
  handle: (text: string) => Promise<string>;
  home: string;
  log: (msg: string) => void;
};

async function handleWithPairing(opts: PairingDeps): Promise<void> {
  const { m, platform, handle, home, log } = opts;
  const { isApproved, requestPairing, verifyCode, looksLikeCode } = await import("./pairing.js");
  if (await isApproved(m.chatId, home)) {
    let reply: string;
    try { reply = await handle(m.text); }
    catch (err) { reply = `error: ${err instanceof Error ? err.message : String(err)}`; }
    await platform.send({ chatId: m.chatId, text: reply });
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
    await platform.send({ chatId: m.chatId, text: replies[result] ?? "Try again." });
    if (result === "approved") log(`  ✓ pairing approved: ${m.chatId} on ${platform.id}`);
    return;
  }
  const code = await requestPairing(m.chatId, platform.id, home);
  log(`  ⏳ pairing requested: ${m.chatId} on ${platform.id}`);
  await platform.send({ chatId: m.chatId, text: `Vanta requires pairing. Your code is: ${code}\n\nReply with this code to connect (valid 1 hour).` });
}

type GatewayPollDeps = {
  platform?: PlatformAdapter;
  handle?: (text: string) => Promise<string>;
  home?: string;
  log?: (msg: string) => void;
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
      await handleWithPairing({ m, platform: deps.platform, handle: deps.handle, home: deps.home, log }).catch((err) => {
        log(`  pairing error: ${err instanceof Error ? err.message : String(err)}`);
      });
    } else {
      let reply: string;
      try { reply = await deps.handle(m.text); }
      catch (err) { reply = `error: ${err instanceof Error ? err.message : String(err)}`; }
      await deps.platform.send({ chatId: m.chatId, text: reply });
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
): Promise<WebhookServer | undefined> {
  if (!webhook || !handle) return undefined;
  const { prompt, deliver } = webhook;
  return startWebhookServer({
    port: webhook.port,
    secret: webhook.secret,
    log,
    onEvent: async (body) => {
      const reply = await handle(prompt(body));
      await deliver(reply);
    },
  }).catch((err: unknown) => {
    log(`vanta gateway: webhook listener failed — ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  });
}
