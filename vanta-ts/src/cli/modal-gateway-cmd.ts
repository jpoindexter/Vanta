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
import { buildGatewayStatus, statusNextLines, telegramTokenDiagnostic, telegramTokenState } from "./modal-gateway-status.js";

const exec = promisify(execFile);
const HELPER = fileURLToPath(new URL("../exec/adapters/modal-gateway.py", import.meta.url));

type ControlResult = { stdout: string; stderr: string };
type ControlRunner = (
  command: string,
  args: string[],
  options: { cwd: string; timeout: number; maxBuffer: number; env?: NodeJS.ProcessEnv },
) => Promise<ControlResult>;
type RegisterInput = {
  repoRoot: string;
  endpointArg: string | undefined;
  env: NodeJS.ProcessEnv;
  deps: ModalGatewayDeps;
  log: (line: string) => void;
};
type RegistrationReady = {
  token: string;
  secret: string;
  endpoint: string;
  previous: Awaited<ReturnType<typeof readGatewayReceipt>>;
};
type StatusInput = { repoRoot: string; env: NodeJS.ProcessEnv; deps: ModalGatewayDeps; log: (line: string) => void; json: boolean };

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

function appLine(cfg: GatewayConfig, app: ModalApp | undefined): string {
  const state = app ? `${app.state} · ${app.tasks ?? "?"} task(s)` : "not deployed";
  return `serverless gateway: app ${cfg.app} ${state}`;
}

function secretLine(cfg: GatewayConfig, hasSecret: boolean): string {
  return `serverless gateway: secret ${cfg.secret} ${hasSecret ? "ready" : "missing (Vanta will not upload local keys)"}`;
}

async function status(input: StatusInput): Promise<number> {
  const { repoRoot, env, deps, log, json } = input;
  if (!await ensureReady(deps, log)) return 1;
  const cfg = resolveModalGatewayConfig(env);
  const state = await resources(repoRoot, deps.run ?? runChild, cfg);
  const receipt = await readGatewayReceipt(repoRoot);
  const report = buildGatewayStatus(cfg, state, receipt, env);
  if (json) {
    log(JSON.stringify(report, null, 2));
    return report.ready ? 0 : 1;
  }
  const telegramToken = telegramTokenState(env.VANTA_TELEGRAM_TOKEN);
  const tokenDiagnostic = telegramTokenDiagnostic(env.VANTA_TELEGRAM_TOKEN);
  const webhookSecret = env.VANTA_TELEGRAM_WEBHOOK_SECRET?.trim() ? "present" : "missing";
  log(appLine(cfg, state.app));
  log(secretLine(cfg, state.hasSecret));
  const registration = receipt?.telegramRegisteredAt ? `registered ${receipt.telegramRegisteredAt}` : "not registered";
  const diagnostic = telegramToken === "invalid-format" ? ` (${tokenDiagnostic})` : "";
  log(`serverless gateway: Telegram endpoint ${receipt?.endpoint ?? "missing"} · ${registration} · token ${telegramToken}${diagnostic} · webhook secret ${webhookSecret}`);
  log(`serverless gateway: min ${cfg.minContainers} · scaledown ${cfg.scaledownSec}s · volume ${cfg.volume}`);
  for (const line of statusNextLines(cfg, state, receipt, env)) log(`serverless gateway: ${line}`);
  return report.ready ? 0 : 1;
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
    env: {
      ...env,
      VANTA_MODAL_GATEWAY_APP: cfg.app,
      VANTA_MODAL_GATEWAY_SECRET: cfg.secret,
      VANTA_MODAL_GATEWAY_VOLUME: cfg.volume,
      VANTA_MODAL_GATEWAY_MIN_CONTAINERS: String(cfg.minContainers),
    },
  });
  const deployedBaseUrl = modalEndpointFrom(`${result.stdout}\n${result.stderr}`);
  const endpoint = deployedBaseUrl ? telegramWebhookEndpoint(deployedBaseUrl) : undefined;
  await writeGatewayReceipt(repoRoot, {
    ...(await readGatewayReceipt(repoRoot)),
    app: cfg.app,
    volume: cfg.volume,
    endpoint,
    deployedAt: (deps.now ?? (() => new Date()))().toISOString(),
  });
  log(`gateway deployed: ${cfg.app} · min ${cfg.minContainers} · scaledown ${cfg.scaledownSec}s${endpoint ? ` · ${endpoint}` : ""}`);
  return 0;
}

function telegramRegistrationRequest(token: string, secret: string, endpoint: string): [string, RequestInit] {
  return [`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: endpoint,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    }),
  }];
}

async function registrationReady(input: RegisterInput): Promise<RegistrationReady | undefined> {
  const token = input.env.VANTA_TELEGRAM_TOKEN?.trim();
  const secret = input.env.VANTA_TELEGRAM_WEBHOOK_SECRET?.trim();
  const previous = await readGatewayReceipt(input.repoRoot);
  const endpoint = telegramWebhookEndpoint(input.endpointArg ?? previous?.endpoint ?? "");
  return token && secret && endpoint ? { token, secret, endpoint, previous } : undefined;
}

async function setTelegramWebhook(input: RegisterInput, ready: RegistrationReady): Promise<Response | undefined> {
  try {
    return await (input.deps.fetch ?? fetch)(...telegramRegistrationRequest(ready.token, ready.secret, ready.endpoint));
  } catch {
    input.log("gateway register failed: Telegram request unavailable");
    return undefined;
  }
}

async function telegramAccepted(response: Response, log: (line: string) => void): Promise<boolean> {
  const payload = await response.json().catch(() => undefined) as { ok?: boolean; description?: string } | undefined;
  if (response.ok && payload?.ok === true) return true;
  log(`gateway register failed: ${payload?.description ?? `Telegram HTTP ${response.status}`}`);
  return false;
}

async function registerTelegram(input: RegisterInput): Promise<number> {
  const { repoRoot, endpointArg, env, deps, log } = input;
  if (telegramTokenState(env.VANTA_TELEGRAM_TOKEN) === "invalid-format") {
    log(`gateway register requires a valid BotFather VANTA_TELEGRAM_TOKEN (diagnostic: ${telegramTokenDiagnostic(env.VANTA_TELEGRAM_TOKEN)})`);
    return 1;
  }
  const ready = await registrationReady({ repoRoot, endpointArg, env, deps, log });
  if (!ready) {
    log("gateway register requires VANTA_TELEGRAM_TOKEN, VANTA_TELEGRAM_WEBHOOK_SECRET, and the deployed HTTPS endpoint");
    return 1;
  }
  const response = await setTelegramWebhook({ repoRoot, endpointArg, env, deps, log }, ready);
  if (!response || !await telegramAccepted(response, log)) return 1;
  const cfg = resolveModalGatewayConfig(env);
  const telegramRegisteredAt = (deps.now ?? (() => new Date()))().toISOString();
  await writeGatewayReceipt(repoRoot, { ...ready.previous, app: ready.previous?.app ?? cfg.app, volume: ready.previous?.volume ?? cfg.volume, endpoint: ready.endpoint, telegramRegisteredAt });
  log(`Telegram webhook registered: ${ready.endpoint}`);
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
  if (state.app?.state !== "deployed" || state.app.tasks !== "0" || !receipt?.endpoint || !receipt.telegramRegisteredAt) {
    log("gateway proof cannot arm: deployment must be idle at 0 tasks with a registered Telegram webhook");
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
  await writeGatewayReceipt(repoRoot, {
    ...receipt,
    provedAt: (deps.now ?? (() => new Date()))().toISOString(),
    telegramAcceptedAt: accepted.acceptedAt,
    telegramParts: accepted.parts,
  });
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
  if (command === "status") return status({ repoRoot, env, deps, log, json: rest.includes("--json") });
  if (command === "deploy") return deploy(repoRoot, env, deps, log);
  if (command === "register-telegram") return registerTelegram({ repoRoot, endpointArg: rest[1], env, deps, log });
  if (command === "arm") return arm(repoRoot, env, deps, log);
  if (command === "prove") return prove(repoRoot, env, deps, log);
  log("Usage: vanta backend gateway [status [--json]|deploy|register-telegram [url]|arm|prove]");
  return 1;
}
