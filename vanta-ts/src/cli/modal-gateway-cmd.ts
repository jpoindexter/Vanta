import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { serverlessCliStatus, type ServerlessCliStatus } from "../exec/adapters/serverless.js";
import {
  modalAppFrom,
  modalEndpointFrom,
  modalSecretExists,
  parseTelegramProofs,
  readGatewayReceipt,
  resolveModalGatewayConfig,
  telegramWebhookEndpoint,
  writeGatewayReceipt,
  type GatewayConfig,
  type ModalApp,
} from "../exec/modal-gateway-state.js";

const exec = promisify(execFile);
const HELPER = fileURLToPath(new URL("../exec/adapters/modal-gateway.py", import.meta.url));

type ControlResult = { stdout: string; stderr: string };
type ControlRunner = (
  command: string,
  args: string[],
  options: { cwd: string; timeout: number; maxBuffer: number; env?: NodeJS.ProcessEnv },
) => Promise<ControlResult>;

export type ModalGatewayDeps = {
  log?: (line: string) => void;
  run?: ControlRunner;
  readiness?: () => Promise<ServerlessCliStatus>;
  fetch?: typeof fetch;
  now?: () => Date;
  helper?: string;
};

async function runChild(
  command: string,
  args: string[],
  options: Parameters<ControlRunner>[2],
): Promise<ControlResult> {
  const result = await exec(command, args, { ...options, encoding: "utf8" });
  return { stdout: String(result.stdout), stderr: String(result.stderr) };
}

async function resources(
  repoRoot: string,
  run: ControlRunner,
  cfg: GatewayConfig,
): Promise<{ app?: ModalApp; hasSecret: boolean }> {
  const [apps, secrets] = await Promise.all([
    run("modal", ["app", "list", "--json"], { cwd: repoRoot, timeout: 30_000, maxBuffer: 4_000_000 }),
    run("modal", ["secret", "list", "--json"], { cwd: repoRoot, timeout: 30_000, maxBuffer: 4_000_000 }),
  ]);
  return { app: modalAppFrom(apps.stdout, cfg.app), hasSecret: modalSecretExists(secrets.stdout, cfg.secret) };
}

async function ensureReady(deps: ModalGatewayDeps, log: (line: string) => void): Promise<boolean> {
  const ready = await (deps.readiness ?? (() => serverlessCliStatus("modal")))();
  if (!ready.ok) log(`serverless gateway unavailable — ${ready.reason}`);
  return ready.ok;
}

async function status(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  deps: ModalGatewayDeps,
  log: (line: string) => void,
): Promise<number> {
  if (!await ensureReady(deps, log)) return 1;
  const cfg = resolveModalGatewayConfig(env);
  const state = await resources(repoRoot, deps.run ?? runChild, cfg);
  const receipt = await readGatewayReceipt(repoRoot);
  const telegramToken = env.VANTA_TELEGRAM_TOKEN?.trim() ? "present" : "missing";
  const webhookSecret = env.VANTA_TELEGRAM_WEBHOOK_SECRET?.trim() ? "present" : "missing";
  log(`serverless gateway: app ${cfg.app} ${state.app ? `${state.app.state} · ${state.app.tasks ?? "?"} task(s)` : "not deployed"}`);
  log(`serverless gateway: secret ${cfg.secret} ${state.hasSecret ? "ready" : "missing (Vanta will not upload local keys)"}`);
  log(`serverless gateway: Telegram registration ${receipt?.endpoint ? receipt.endpoint : "no endpoint receipt"} · token ${telegramToken} · webhook secret ${webhookSecret}`);
  log(`serverless gateway: min 0 · scaledown ${cfg.scaledownSec}s · volume ${cfg.volume}`);
  return state.app?.state === "deployed" && state.hasSecret ? 0 : 1;
}

async function deploy(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  deps: ModalGatewayDeps,
  log: (line: string) => void,
): Promise<number> {
  if (!await ensureReady(deps, log)) return 1;
  const cfg = resolveModalGatewayConfig(env);
  const run = deps.run ?? runChild;
  const state = await resources(repoRoot, run, cfg);
  if (!state.hasSecret) {
    log(`gateway deploy refused: Modal secret ${cfg.secret} is missing`);
    log("Create it explicitly with Telegram webhook credentials and a model provider; Vanta will not copy local secrets.");
    return 1;
  }
  const result = await run("modal", ["deploy", deps.helper ?? HELPER, "--name", cfg.app], {
    cwd: repoRoot,
    timeout: 1_200_000,
    maxBuffer: 16_000_000,
    env: { ...env, VANTA_MODAL_GATEWAY_APP: cfg.app, VANTA_MODAL_GATEWAY_SECRET: cfg.secret, VANTA_MODAL_GATEWAY_VOLUME: cfg.volume },
  });
  const endpoint = modalEndpointFrom(`${result.stdout}\n${result.stderr}`);
  await writeGatewayReceipt(repoRoot, {
    ...(await readGatewayReceipt(repoRoot)),
    app: cfg.app,
    volume: cfg.volume,
    endpoint,
    deployedAt: (deps.now ?? (() => new Date()))().toISOString(),
  });
  log(`gateway deployed: ${cfg.app} · min 0 · scaledown ${cfg.scaledownSec}s${endpoint ? ` · ${endpoint}` : ""}`);
  return 0;
}

async function registerTelegram(
  repoRoot: string,
  endpointArg: string | undefined,
  env: NodeJS.ProcessEnv,
  deps: ModalGatewayDeps,
  log: (line: string) => void,
): Promise<number> {
  const token = env.VANTA_TELEGRAM_TOKEN?.trim();
  const secret = env.VANTA_TELEGRAM_WEBHOOK_SECRET?.trim();
  const previous = await readGatewayReceipt(repoRoot);
  const endpoint = telegramWebhookEndpoint(endpointArg ?? previous?.endpoint ?? "");
  if (!token || !secret || !endpoint) {
    log("gateway register requires VANTA_TELEGRAM_TOKEN, VANTA_TELEGRAM_WEBHOOK_SECRET, and the deployed HTTPS endpoint");
    return 1;
  }
  let response: Response;
  try {
    response = await (deps.fetch ?? fetch)(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: endpoint,
        secret_token: secret,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false,
      }),
    });
  } catch {
    log("gateway register failed: Telegram request unavailable");
    return 1;
  }
  const payload = await response.json().catch(() => undefined) as { ok?: boolean; description?: string } | undefined;
  if (!response.ok || payload?.ok !== true) {
    log(`gateway register failed: ${payload?.description ?? `Telegram HTTP ${response.status}`}`);
    return 1;
  }
  const cfg = resolveModalGatewayConfig(env);
  await writeGatewayReceipt(repoRoot, { ...previous, app: previous?.app ?? cfg.app, volume: previous?.volume ?? cfg.volume, endpoint });
  log(`Telegram webhook registered: ${endpoint}`);
  return 0;
}

async function arm(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  deps: ModalGatewayDeps,
  log: (line: string) => void,
): Promise<number> {
  if (!await ensureReady(deps, log)) return 1;
  const cfg = resolveModalGatewayConfig(env);
  const state = await resources(repoRoot, deps.run ?? runChild, cfg);
  const receipt = await readGatewayReceipt(repoRoot);
  if (state.app?.state !== "deployed" || state.app.tasks !== "0" || !receipt?.endpoint) {
    log("gateway proof cannot arm: deployment must be idle at 0 tasks with a registered endpoint");
    return 1;
  }
  const armedAt = (deps.now ?? (() => new Date()))().toISOString();
  await writeGatewayReceipt(repoRoot, { ...receipt, armedAt });
  log(`gateway proof armed at zero containers: ${armedAt}`);
  log("Send the Telegram bot one message, wait for its reply and scaledown, then run `vanta backend gateway prove`.");
  return 0;
}

async function prove(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
  deps: ModalGatewayDeps,
  log: (line: string) => void,
): Promise<number> {
  if (!await ensureReady(deps, log)) return 1;
  const cfg = resolveModalGatewayConfig(env);
  const receipt = await readGatewayReceipt(repoRoot);
  if (!receipt?.armedAt) {
    log("gateway proof is not armed; run `vanta backend gateway arm` while the app has 0 tasks");
    return 1;
  }
  const run = deps.run ?? runChild;
  let downloaded: ControlResult;
  try {
    downloaded = await run("modal", ["volume", "get", cfg.volume, "project/channel-proofs.jsonl", "-"], {
      cwd: repoRoot,
      timeout: 30_000,
      maxBuffer: 4_000_000,
    });
  } catch {
    log("gateway proof has no accepted Telegram reply after it was armed");
    return 1;
  }
  const accepted = parseTelegramProofs(downloaded.stdout)
    .filter((proof) => Date.parse(proof.acceptedAt) > Date.parse(receipt.armedAt!))
    .at(-1);
  if (!accepted) {
    log("gateway proof has no accepted Telegram reply after it was armed");
    return 1;
  }
  const state = await resources(repoRoot, run, cfg);
  if (state.app?.tasks !== "0") {
    log(`gateway reply accepted at ${accepted.acceptedAt}; ${state.app?.tasks ?? "?"} task(s) remain — wait for scaledown and rerun prove`);
    return 1;
  }
  log(`gateway proof passed: 0 tasks -> Telegram wake/reply at ${accepted.acceptedAt} -> 0 tasks`);
  log(`Modal policy: min 0 · scaledown ${cfg.scaledownSec}s · accepted ${accepted.parts} Bot API part(s)`);
  return 0;
}

export async function runModalGatewayCommand(
  repoRoot: string,
  rest: string[],
  env: NodeJS.ProcessEnv = process.env,
  deps: ModalGatewayDeps = {},
): Promise<number> {
  const log = deps.log ?? console.log;
  const command = rest[0] ?? "status";
  if (command === "status") return status(repoRoot, env, deps, log);
  if (command === "deploy") return deploy(repoRoot, env, deps, log);
  if (command === "register-telegram") return registerTelegram(repoRoot, rest[1], env, deps, log);
  if (command === "arm") return arm(repoRoot, env, deps, log);
  if (command === "prove") return prove(repoRoot, env, deps, log);
  log("Usage: vanta backend gateway [status|deploy|register-telegram [url]|arm|prove]");
  return 1;
}
