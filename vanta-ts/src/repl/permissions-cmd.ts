import type { SlashHandler } from "./types.js";

const HELP_TEXT =
  "  /permissions [list|allow <tool>|block <tool>|reset]\n" +
  "\n" +
  "  list     Show current allow/block rules\n" +
  "  allow    Add a tool to the allow list (skips approval)\n" +
  "  block    Add a tool to the block list (always denied)\n" +
  "  reset    Clear all custom rules\n" +
  "\n" +
  "  Rules are managed by the kernel at ~/.vanta/approvals.tsv";

export const permissions: SlashHandler = (arg, _ctx) => {
  const action = arg.trim().split(/\s+/)[0]?.toLowerCase();

  if (!action) return { output: HELP_TEXT };

  if (action === "list") {
    return {
      output:
        "  (Permission rules are managed by the kernel at ~/.vanta/approvals.tsv)\n" +
        "  Use /status to see current kernel policy.",
    };
  }

  if (action === "allow" || action === "block") {
    const tool = arg.trim().split(/\s+/).slice(1).join(" ");
    if (!tool) return { output: `  usage: /permissions ${action} <tool name>` };
    return {
      output:
        `  (${action} rule for '${tool}' would be managed by the kernel)\n` +
        `  Run this via the agent with kernel approval to persist the rule.`,
    };
  }

  if (action === "reset") {
    return {
      output:
        "  (Resetting permission rules requires kernel interaction)\n" +
        "  Clear ~/.vanta/approvals.tsv manually, then restart the kernel.",
    };
  }

  return { output: `  unknown action '${action}' — use /permissions for help` };
};
