import { probeMessaging, type ProbeResult } from "../setup/assistant.js";
import type { ReplCtx, SlashHandler } from "./types.js";

type SetupCommandDeps = {
  probe?: (env: NodeJS.ProcessEnv) => Promise<ProbeResult>;
};

export function isTelegramSetupQuestion(text: string): boolean {
  const normalized = text.toLowerCase().replace(/telgram/g, "telegram");
  return /\btelegram\b/.test(normalized)
    && /\b(set\s*up|setup|configure|connect|command|wizard)\b/.test(normalized);
}

function telegramAccess(env: NodeJS.ProcessEnv): string {
  return env.VANTA_TELEGRAM_ALLOW?.trim()
    ? "owner allowlist on"
    : "open to anyone who can reach the bot";
}

export function renderSetupHub(ctx: ReplCtx): string {
  const telegram = ctx.env.VANTA_TELEGRAM_TOKEN?.trim()
    ? `configured (${telegramAccess(ctx.env)})`
    : "needs setup";
  return [
    "  Setup",
    `  Model      ${ctx.setup.provider.modelId()} · /model`,
    `  Telegram   ${telegram} · /setup messaging`,
    "  Voice      vanta setup tts",
    "  MCP        /mcp",
  ].join("\n");
}

export function createSetupCommand(deps: SetupCommandDeps = {}): SlashHandler {
  const probe = deps.probe ?? probeMessaging;
  return async (arg, ctx) => {
    const [section = "", ...rest] = arg.trim().split(/\s+/).filter(Boolean);
    if (!section) return { output: renderSetupHub(ctx) };

    if (section === "model") {
      const modelArg = rest.join(" ");
      if (!modelArg) return { output: "  Open the model picker with /model." };
      const { model } = await import("./model-cmd.js");
      return model(modelArg, ctx);
    }

    if (section === "messaging" || section === "telegram") {
      if (!ctx.env.VANTA_TELEGRAM_TOKEN?.trim()) {
        return {
          output: [
            "  Telegram needs setup.",
            "  Run: vanta setup messaging telegram",
            "  Vanta will verify the bot token before saving it, then collect the owner allowlist.",
          ].join("\n"),
        };
      }
      const result = await probe(ctx.env);
      if (!result.ok) {
        return {
          output: [
            `  Telegram is configured but not usable: ${result.detail}.`,
            "  Repair: vanta setup messaging telegram",
            "  Your existing configuration is preserved until the replacement token passes verification.",
          ].join("\n"),
        };
      }
      return {
        output: [
          `  Telegram ready: ${result.detail}.`,
          `  Access: ${telegramAccess(ctx.env)}.`,
          `  Delivery: ${ctx.env.VANTA_TELEGRAM_WEBHOOK_SECRET?.trim() ? "webhook wake configured" : "local gateway polling"}.`,
          "  Check: vanta gateway status",
        ].join("\n"),
      };
    }

    if (section === "tts" || section === "voice") {
      return { output: "  Run: vanta setup tts" };
    }

    return { output: "  usage: /setup [model|messaging|telegram|tts]" };
  };
}

export const setupCommand = createSetupCommand();
