import type { SlashHandler } from "./types.js";
import { dirname } from "node:path";
import { BUILTIN_AGENTS } from "../subagent/builtin-agents.js";
import { isCustomAgentDef, loadAgentDefs, type ResolvedAgentType } from "../subagent/agent-defs.js";
import {
  activePromptPresetName,
  applyPromptPreset,
  removePromptPreset,
  validatePromptPreset,
  type PromptPreset,
} from "../prompt/presets.js";

function exactAgentType(name: string, custom: readonly ResolvedAgentType[]): ResolvedAgentType | undefined {
  const key = name.trim().toLowerCase();
  return custom.find((item) => item.name.toLowerCase() === key) ?? BUILTIN_AGENTS[key];
}

function asPreset(type: ResolvedAgentType): PromptPreset {
  return { name: type.name, content: isCustomAgentDef(type) ? type.systemPrompt : type.persona };
}

export const promptCommand: SlashHandler = (arg, ctx) => {
  const sys = ctx.convo.messages[0];
  if (!sys || sys.role !== "system") return { output: "  prompt presets unavailable (no system message)" };
  const custom = loadAgentDefs(dirname(ctx.dataDir), ctx.env);
  const [action = "list", ...rest] = arg.trim().split(/\s+/).filter(Boolean);
  const name = action === "use" || action === "show" ? rest.join(" ") : action;

  if (action === "list" || !arg.trim()) {
    const active = activePromptPresetName(sys.content) ?? "base";
    const builtins = Object.values(BUILTIN_AGENTS).map((item) => `  ${item.name.padEnd(18)} built-in · ${item.description}`);
    const user = custom.map((item) => `  ${item.name.padEnd(18)} custom · ${item.description || "no description"}`);
    return { output: [`  active: ${active}`, "", ...builtins, ...user, "", "  use: /prompt use <name> · reset: /prompt reset"].join("\n") };
  }
  if (action === "reset" || action === "base") {
    sys.content = removePromptPreset(sys.content);
    return { output: "  ✓ restored Vanta's base system prompt for this session" };
  }
  const type = exactAgentType(name, custom);
  if (!type) return { output: `  unknown prompt preset '${name}' — run /prompt list` };
  const preset = asPreset(type);
  const error = validatePromptPreset(preset);
  if (error) return { output: `  ${error}` };
  if (action === "show") {
    return { output: `  ${preset.name} (${isCustomAgentDef(type) ? "custom" : "built-in"})\n\n${preset.content}` };
  }
  if (action !== "use" && rest.length > 0) return { output: "  usage: /prompt list|show <name>|use <name>|reset" };
  sys.content = applyPromptPreset(sys.content, preset);
  return { output: `  ✓ prompt preset '${preset.name}' active for this session\n  base safety, approvals, and kernel policy remain enforced` };
};
