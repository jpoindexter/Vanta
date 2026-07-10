import type { GatewayConfig, ModalApp } from "../exec/modal-gateway-state.js";

type GatewayReceipt = { endpoint?: string } | null | undefined;
type GatewayState = { app?: ModalApp; hasSecret: boolean };

export type GatewayStatusReport = {
  ready: boolean;
  app: { name: string; state: string; tasks?: string };
  secret: { name: string; ready: boolean };
  telegram: { endpoint?: string; token: "present" | "missing"; webhookSecret: "present" | "missing" };
  policy: { minContainers: 0; scaledownSec: number; volume: string };
  next: string[];
};

export function statusNextLines(cfg: GatewayConfig, state: GatewayState, receipt: GatewayReceipt, env: NodeJS.ProcessEnv): string[] {
  const missingEnv = ["VANTA_TELEGRAM_TOKEN", "VANTA_TELEGRAM_WEBHOOK_SECRET"].filter((key) => !env[key]?.trim());
  const lines: string[] = [];
  if (!state.hasSecret) lines.push(`next: modal secret create ${cfg.secret} VANTA_TELEGRAM_TOKEN=... VANTA_TELEGRAM_WEBHOOK_SECRET=... VANTA_PROVIDER=... VANTA_MODEL=...`);
  if (!state.app) lines.push("next: vanta backend gateway deploy");
  if (missingEnv.length) lines.push(`next: export ${missingEnv.map((key) => `${key}=...`).join(" ")}`);
  if (!receipt?.endpoint) lines.push("next: vanta backend gateway register-telegram <https-endpoint>");
  if (state.app?.state === "deployed" && state.hasSecret && receipt?.endpoint && missingEnv.length === 0) lines.push("next: vanta backend gateway arm, send the bot a message, then vanta backend gateway prove");
  return lines;
}

export function buildGatewayStatus(
  cfg: GatewayConfig,
  state: GatewayState,
  receipt: GatewayReceipt,
  env: NodeJS.ProcessEnv,
): GatewayStatusReport {
  return {
    ready: state.app?.state === "deployed" && state.hasSecret,
    app: { name: cfg.app, state: state.app?.state ?? "not deployed", tasks: state.app?.tasks },
    secret: { name: cfg.secret, ready: state.hasSecret },
    telegram: {
      endpoint: receipt?.endpoint,
      token: env.VANTA_TELEGRAM_TOKEN?.trim() ? "present" : "missing",
      webhookSecret: env.VANTA_TELEGRAM_WEBHOOK_SECRET?.trim() ? "present" : "missing",
    },
    policy: { minContainers: 0, scaledownSec: cfg.scaledownSec, volume: cfg.volume },
    next: statusNextLines(cfg, state, receipt, env).map((line) => line.replace(/^next: /, "")),
  };
}
