import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolSchema } from "../providers/interface.js";
import type { Settings } from "../settings/store.js";
import { resolveVantaHome } from "../store/home.js";

type Context = {
  schemas: ToolSchema[];
  settings: Settings;
  profileId?: string;
  env: NodeJS.ProcessEnv;
  fileExists?: (path: string) => boolean;
};

export type ToolBoundaryExplanation = {
  tool: string;
  known: boolean;
  visible: boolean;
  reason: string;
  typicalRisk: "allow" | "ask" | "block";
  setup: string;
  missing: string[];
  repairs: string[];
  warning?: string;
};

export function explainToolBoundary(tool: string, ctx: Context): ToolBoundaryExplanation {
  const known = ctx.schemas.some((schema) => schema.name === tool);
  const blocked = ctx.settings.blockedTools?.includes(tool) ?? false;
  const allowlisted = ctx.settings.allowedTools === undefined || ctx.settings.allowedTools.includes(tool);
  const visible = known && !blocked && allowlisted;
  const missing = missingSetup(tool, ctx);
  const repairs = repairSteps(tool, ctx, { known, blocked, allowlisted, missing });
  return {
    tool, known, visible, reason: visibilityReason(ctx.profileId, { known, blocked, allowlisted }),
    typicalRisk: typicalRisk(tool), setup: setupHint(tool), missing, repairs,
    ...(surfaceWarning(ctx) ? { warning: surfaceWarning(ctx) } : {}),
  };
}

export function repairToolFailure(tool: string, output: string, ctx: Context): string {
  const explanation = explainToolBoundary(tool, ctx);
  const repair = explanation.repairs[0] ?? `vanta tools why ${tool}`;
  return `${output}\nRepair: ${repair}`;
}

function visibilityReason(profileId: string | undefined, state: { known: boolean; blocked: boolean; allowlisted: boolean }): string {
  if (!state.known) return "not registered in the current Vanta tool catalog";
  if (state.blocked) return "hidden by blockedTools";
  if (!state.allowlisted) return `hidden for ${profileId ?? "this role"}: not in allowedTools`;
  return `visible for ${profileId ?? "the active role"}`;
}

function typicalRisk(tool: string): "allow" | "ask" | "block" {
  if (/^(read_file|grep_files|glob_files|inspect_|git_status|git_diff|recall|ref_search)/.test(tool)) return "allow";
  if (/(send|create|update|write|edit|delete|push|commit|shell|run_code|browser_act|deploy)/.test(tool)) return "ask";
  return "ask";
}

function setupHint(tool: string): string {
  if (/^(gmail_|calendar_|drive_)/.test(tool)) return "Google OAuth";
  if (/^(browser_|screenshot)/.test(tool)) return "vanta setup tools: browser";
  if (/^(web_search|web_fetch)$/.test(tool)) return "vanta setup tools: search provider";
  if (/^(describe_image|compare_vision)/.test(tool)) return "vanta setup tools: vision provider";
  return "none beyond normal Vanta setup";
}

function missingSetup(tool: string, ctx: Context): string[] {
  if (/^(gmail_|calendar_|drive_)/.test(tool)) {
    const exists = ctx.fileExists ?? existsSync;
    return exists(join(resolveVantaHome(ctx.env), "google-tokens.json")) ? [] : ["Google OAuth token"];
  }
  return [];
}

function repairSteps(tool: string, ctx: Context, state: { known: boolean; blocked: boolean; allowlisted: boolean; missing: string[] }): string[] {
  const repairs: string[] = [];
  if (!state.known) repairs.push("install or enable the plugin/MCP server that provides this tool");
  if (state.blocked) repairs.push("vanta setup");
  if (!state.allowlisted && ctx.profileId) repairs.push(`vanta profiles tools ${ctx.profileId} --allow ${tool}`);
  if (state.missing.includes("Google OAuth token")) repairs.push("vanta auth google");
  return repairs;
}

function surfaceWarning(ctx: Context): string | undefined {
  if (ctx.settings.allowedTools === undefined) return "profile exposes the full tool surface; declare allowedTools for a smaller role boundary";
  if (ctx.schemas.length > 0 && ctx.settings.allowedTools.length / ctx.schemas.length > 0.75) return "profile allowlist covers more than 75% of tools";
  return undefined;
}
