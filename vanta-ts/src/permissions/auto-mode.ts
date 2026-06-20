import type { Settings } from "../settings/store.js";
import { resolvePermissionMode } from "../modes/permission-mode.js";
import { isDangerousInterpreter, stripDangerousAllowRules } from "./dangerous-patterns.js";

export type AutoModeRuleAction = "allow" | "ask" | "soft_deny";

export type AutoModeRule = {
  action: AutoModeRuleAction;
  tool?: string;
  pattern?: string;
  label?: string;
};

export type AutoModeConfig = {
  softDeny: boolean;
  rules: AutoModeRule[];
};

export type AutoModeDecision = {
  decision: "allow" | "ask" | "block";
  reason: string;
};

export const DEFAULT_AUTO_MODE_CONFIG: AutoModeConfig = {
  softDeny: true,
  rules: [
    { action: "soft_deny", tool: "shell_cmd", pattern: "| bash", label: "pipe-to-shell installer" },
    { action: "soft_deny", tool: "shell_cmd", pattern: "curl ", label: "remote shell/network mutation" },
    { action: "soft_deny", pattern: "password", label: "secret-bearing action" },
    { action: "allow", tool: "read_file", label: "read-only file inspection" },
    { action: "allow", tool: "grep_files", label: "read-only search" },
    { action: "allow", tool: "glob_files", label: "read-only file discovery" },
    { action: "allow", tool: "inspect_state", label: "read-only state inspection" },
  ],
};

function norm(s: string): string {
  return s.toLowerCase();
}

function matches(rule: AutoModeRule, toolName: string, descriptor: string): boolean {
  if (rule.tool !== undefined && rule.tool !== toolName) return false;
  if (rule.pattern !== undefined && !norm(descriptor).includes(norm(rule.pattern))) return false;
  return true;
}

function rank(rule: AutoModeRule): number {
  return (rule.tool ? 2 : 0) + (rule.pattern ? 1 : 0);
}

function bestRule(rules: AutoModeRule[], toolName: string, descriptor: string): AutoModeRule | null {
  let best: AutoModeRule | null = null;
  let bestScore = -1;
  for (const rule of rules) {
    if (!matches(rule, toolName, descriptor)) continue;
    const score = rank(rule);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  return best;
}

export function resolveAutoModeConfig(settings: Pick<Settings, "autoMode">): AutoModeConfig {
  // Strip any user allow-rule that would auto-approve a dangerous interpreter
  // (bash -c / python -c / node -e / eval / pipe-to-shell, …) at auto-mode entry,
  // so auto-mode can never silently auto-approve arbitrary code execution.
  const custom = stripDangerousAllowRules(settings.autoMode?.rules ?? []);
  return {
    softDeny: settings.autoMode?.softDeny ?? DEFAULT_AUTO_MODE_CONFIG.softDeny,
    rules: [...custom, ...DEFAULT_AUTO_MODE_CONFIG.rules],
  };
}

export function isAutoModeEnabled(env: NodeJS.ProcessEnv, settings: Pick<Settings, "autoMode">): boolean {
  if (env.VANTA_PERMISSION_MODE !== undefined) return resolvePermissionMode(env) === "auto";
  const mode = resolvePermissionMode(env);
  if (mode === "auto") return true;
  if (mode !== "default" || env.VANTA_AUTO_MODE === "0") return false;
  return settings.autoMode?.enabled === true;
}

export function classifyAutoModeAction(args: {
  kernelRisk: "allow" | "ask" | "block";
  toolName: string;
  descriptor: string;
  config: AutoModeConfig;
}): AutoModeDecision {
  if (args.kernelRisk === "block") return { decision: "block", reason: "kernel block is immovable" };
  const rule = bestRule(args.config.rules, args.toolName, args.descriptor);
  // Backstop: even if a surviving allow-rule matches, never auto-approve a command
  // that is itself a dangerous interpreter invocation — gate it to ASK.
  if (rule?.action === "allow" && isDangerousInterpreter(args.descriptor)) {
    return { decision: "ask", reason: "auto-mode: dangerous interpreter not auto-approved" };
  }
  if (!rule) return { decision: args.kernelRisk, reason: "auto-mode fallback: no classifier match" };
  return decideFromRule(rule, args.config.softDeny);
}

function decideFromRule(rule: AutoModeRule, softDeny: boolean): AutoModeDecision {
  const label = rule.label ?? `${rule.tool ?? "any"} ${rule.pattern ?? ""}`.trim();
  if (rule.action === "soft_deny") {
    return { decision: softDeny ? "block" : "ask", reason: `auto-mode soft-deny: ${label}` };
  }
  if (rule.action === "ask") return { decision: "ask", reason: `auto-mode ask: ${label}` };
  return { decision: "allow", reason: `auto-mode allow: ${label}` };
}

export function formatAutoModeConfig(config: AutoModeConfig, label: "defaults" | "effective"): string {
  return [
    `auto-mode ${label}`,
    `soft_deny ${config.softDeny ? "yes" : "no"}`,
    ...config.rules.map((rule, i) => {
      const tool = rule.tool ?? "*";
      const pattern = rule.pattern ?? "*";
      const name = rule.label ? ` · ${rule.label}` : "";
      return `${i + 1}. ${rule.action} · ${tool} · ${pattern}${name}`;
    }),
  ].join("\n");
}
