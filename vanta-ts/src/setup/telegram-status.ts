import { readGatewayReadiness, type GatewayReadinessSnapshot } from "../gateway/readiness-state.js";
import { probeMessaging, type ProbeResult } from "./assistant.js";

const GATEWAY_STALE_MS = 180_000;

export type TelegramSetupState = "unconfigured" | "needs_repair" | "stopped" | "polling_live" | "webhook_live";

export type TelegramSetupStatus = {
  state: TelegramSetupState;
  title: string;
  detail: string;
  action: {
    id: "configure" | "start_gateway" | "inspect_gateway";
    label: string;
    command: string;
  };
};

type TelegramStatusDeps = {
  probe?: (env: NodeJS.ProcessEnv) => Promise<ProbeResult>;
  readReadiness?: (dataDir: string) => Promise<GatewayReadinessSnapshot | null>;
  now?: () => number;
};

function status(
  state: TelegramSetupState,
  title: string,
  detail: string,
  action: TelegramSetupStatus["action"],
): TelegramSetupStatus {
  return { state, title, detail, action };
}

export async function resolveTelegramSetupStatus(
  env: NodeJS.ProcessEnv,
  dataDir: string,
  deps: TelegramStatusDeps = {},
): Promise<TelegramSetupStatus> {
  if (!env.VANTA_TELEGRAM_TOKEN?.trim()) {
    return status("unconfigured", "Telegram needs setup.", "Add a BotFather token, then choose pairing or an owner allowlist.", {
      id: "configure",
      label: "Open Telegram setup",
      command: "vanta setup messaging telegram",
    });
  }

  const probe = await (deps.probe ?? probeMessaging)(env);
  if (!probe.ok) {
    return status("needs_repair", "Telegram needs repair.", probe.detail, {
      id: "configure",
      label: "Repair Telegram setup",
      command: "vanta setup messaging telegram",
    });
  }

  const snapshot = await (deps.readReadiness ?? readGatewayReadiness)(dataDir);
  const age = snapshot ? Math.max(0, (deps.now?.() ?? Date.now()) - Date.parse(snapshot.updatedAt)) : Number.POSITIVE_INFINITY;
  const channel = snapshot?.channels.find((entry) => entry.id === "telegram");
  if (!snapshot || age > GATEWAY_STALE_MS) {
    return status("stopped", "Telegram is configured, but the gateway is stopped.", probe.detail, {
      id: "start_gateway",
      label: "Start the gateway",
      command: "vanta gateway",
    });
  }

  if (!channel || channel.status === "down") {
    return status("needs_repair", "Telegram is configured, but its channel is down.", probe.detail, {
      id: "inspect_gateway",
      label: "Inspect gateway status",
      command: "vanta gateway status",
    });
  }

  if (env.VANTA_TELEGRAM_WEBHOOK_SECRET?.trim()) {
    return status("webhook_live", "Telegram is live through webhook delivery.", probe.detail, {
      id: "inspect_gateway",
      label: "View gateway status",
      command: "vanta gateway status",
    });
  }

  return status("polling_live", "Telegram is live through local polling.", probe.detail, {
    id: "inspect_gateway",
    label: "View gateway status",
    command: "vanta gateway status",
  });
}

export function renderTelegramSetupStatus(value: TelegramSetupStatus): string {
  return [value.title, value.detail, `${value.action.label}: ${value.action.command}`].join("\n");
}
