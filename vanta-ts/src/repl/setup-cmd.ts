import type { ProbeResult } from "../setup/assistant.js";
import { isTelegramSetupQuestion } from "../setup/telegram-intent.js";
import { renderTelegramSetupStatus, resolveTelegramSetupStatus, type TelegramSetupStatus } from "../setup/telegram-status.js";
import type { ReplCtx, SlashHandler } from "./types.js";

type SetupCommandDeps = {
  probe?: (env: NodeJS.ProcessEnv) => Promise<ProbeResult>;
  status?: (env: NodeJS.ProcessEnv, dataDir: string) => Promise<TelegramSetupStatus>;
};

export { isTelegramSetupQuestion } from "../setup/telegram-intent.js";

function telegramAccess(env: NodeJS.ProcessEnv): string {
  return env.VANTA_TELEGRAM_ALLOW?.trim()
    ? "owner allowlist on"
    : "pairing required for new chats";
}

export function renderSetupHub(ctx: ReplCtx): string {
  const telegram = ctx.env.VANTA_TELEGRAM_TOKEN?.trim()
    ? `configured (${telegramAccess(ctx.env)})`
    : "needs setup";
  return [
    "  Setup",
    `  Model      ${ctx.setup.provider.modelId()} · /model`,
    `  Telegram   ${telegram} · /setup telegram`,
    "  Voice      /setup tts",
    "  MCP        /mcp",
  ].join("\n");
}

export function createSetupCommand(deps: SetupCommandDeps = {}): SlashHandler {
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
      const resolveStatus = deps.status ?? ((env, dataDir) => resolveTelegramSetupStatus(env, dataDir, { probe: deps.probe }));
      const output = renderTelegramSetupStatus(await resolveStatus(ctx.env, ctx.dataDir)).split("\n").map((line) => `  ${line}`).join("\n");
      if (rest[0]?.toLowerCase() === "status") return { output };
      return { output, setupHandoff: { section: "messaging", platformId: "telegram" } };
    }

    if (section === "tts" || section === "voice") {
      return { output: "  Opening voice setup…", setupHandoff: { section: "tts" } };
    }

    if (section === "mcp") return { output: "  Open MCP connections with /mcp." };

    return { output: "  usage: /setup [model|messaging|telegram|tts|mcp]" };
  };
}

export const setupCommand = createSetupCommand();
