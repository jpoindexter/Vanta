import type { GatewayConfig, ModalApp } from "../exec/modal-gateway-state.js";

type GatewayReceipt = { endpoint?: string; telegramRegisteredAt?: string } | null | undefined;
type GatewayState = { app?: ModalApp; hasSecret: boolean };
type TelegramTokenState = "valid-format" | "invalid-format" | "missing";
export type TelegramTokenDiagnostic =
  | "valid-format"
  | "missing"
  | "quoted-value"
  | "contains-whitespace"
  | "missing-colon"
  | "bot-id-not-numeric"
  | "bot-id-length"
  | "secret-length-or-characters";

export type GatewayStatusReport = {
  ready: boolean;
  app: { name: string; state: string; tasks?: string };
  secret: { name: string; ready: boolean };
  telegram: {
    endpoint?: string;
    registeredAt?: string;
    token: TelegramTokenState;
    tokenDiagnostic: TelegramTokenDiagnostic;
    webhookSecret: "present" | "missing";
  };
  policy: { minContainers: 0; scaledownSec: number; volume: string };
  next: string[];
};

export function telegramTokenState(value: string | undefined): TelegramTokenState {
  const token = value?.trim();
  if (!token) return "missing";
  return /^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(token) ? "valid-format" : "invalid-format";
}

export function telegramTokenDiagnostic(value: string | undefined): TelegramTokenDiagnostic {
  const raw = value ?? "";
  const token = raw.trim();
  if (!token) return "missing";
  if ((token.startsWith("\"") && token.endsWith("\"")) || (token.startsWith("'") && token.endsWith("'"))) return "quoted-value";
  if (/\s/.test(token)) return "contains-whitespace";
  const colon = token.indexOf(":");
  if (colon < 0) return "missing-colon";
  const botId = token.slice(0, colon);
  const secret = token.slice(colon + 1);
  if (!/^\d+$/.test(botId)) return "bot-id-not-numeric";
  if (botId.length < 6 || botId.length > 12) return "bot-id-length";
  if (!/^[A-Za-z0-9_-]{30,}$/.test(secret)) return "secret-length-or-characters";
  return "valid-format";
}

function missingTelegramEnv(env: NodeJS.ProcessEnv, token: TelegramTokenState): string[] {
  const missing = token === "missing" ? ["VANTA_TELEGRAM_TOKEN"] : [];
  if (!env.VANTA_TELEGRAM_WEBHOOK_SECRET?.trim()) missing.push("VANTA_TELEGRAM_WEBHOOK_SECRET");
  return missing;
}

function canArm(state: GatewayState, receipt: GatewayReceipt, env: NodeJS.ProcessEnv, token: TelegramTokenState): boolean {
  return state.app?.state === "deployed"
    && state.hasSecret
    && Boolean(receipt?.telegramRegisteredAt)
    && token === "valid-format"
    && Boolean(env.VANTA_TELEGRAM_WEBHOOK_SECRET?.trim());
}

export function statusNextLines(cfg: GatewayConfig, state: GatewayState, receipt: GatewayReceipt, env: NodeJS.ProcessEnv): string[] {
  const token = telegramTokenState(env.VANTA_TELEGRAM_TOKEN);
  const tokenDiagnostic = telegramTokenDiagnostic(env.VANTA_TELEGRAM_TOKEN);
  const missingEnv = missingTelegramEnv(env, token);
  const lines: string[] = [];
  if (!state.hasSecret) lines.push(`next: modal secret create ${cfg.secret} VANTA_TELEGRAM_TOKEN=... VANTA_TELEGRAM_WEBHOOK_SECRET=... VANTA_PROVIDER=... VANTA_MODEL=...`);
  if (!state.app) lines.push("next: vanta backend gateway deploy");
  if (missingEnv.length) lines.push(`next: export ${missingEnv.map((key) => `${key}=...`).join(" ")}`);
  if (token === "invalid-format") lines.push(`next: replace VANTA_TELEGRAM_TOKEN with a valid BotFather token (diagnostic: ${tokenDiagnostic})`);
  if (!receipt?.telegramRegisteredAt) lines.push("next: vanta backend gateway register-telegram <https-endpoint>");
  if (canArm(state, receipt, env, token)) lines.push("next: vanta backend gateway arm, send the bot a message, then vanta backend gateway prove");
  return lines;
}

export function buildGatewayStatus(
  cfg: GatewayConfig,
  state: GatewayState,
  receipt: GatewayReceipt,
  env: NodeJS.ProcessEnv,
): GatewayStatusReport {
  const token = telegramTokenState(env.VANTA_TELEGRAM_TOKEN);
  const tokenDiagnostic = telegramTokenDiagnostic(env.VANTA_TELEGRAM_TOKEN);
  const webhookSecret = env.VANTA_TELEGRAM_WEBHOOK_SECRET?.trim() ? "present" : "missing";
  return {
    ready: canArm(state, receipt, env, token),
    app: { name: cfg.app, state: state.app?.state ?? "not deployed", tasks: state.app?.tasks },
    secret: { name: cfg.secret, ready: state.hasSecret },
    telegram: {
      endpoint: receipt?.endpoint,
      registeredAt: receipt?.telegramRegisteredAt,
      token,
      tokenDiagnostic,
      webhookSecret,
    },
    policy: { minContainers: 0, scaledownSec: cfg.scaledownSec, volume: cfg.volume },
    next: statusNextLines(cfg, state, receipt, env).map((line) => line.replace(/^next: /, "")),
  };
}
