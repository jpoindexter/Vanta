import { parseVarArgs } from "../blueprint/apply.js";
import { getAutomationBlueprint, listAutomationBlueprints } from "../automation-blueprints/catalog.js";
import { previewAutomation } from "../automation-blueprints/runtime.js";
import type { SlashHandler } from "./types.js";

export const blueprint: SlashHandler = async (arg, ctx) => {
  const tokens = arg.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    const items = await listAutomationBlueprints(ctx.env);
    return { output: items.map((item) => `  ${item.name} [${item.kind}] - ${item.description}`).join("\n") };
  }
  const name = tokens[0]!;
  const definition = await getAutomationBlueprint(name, ctx.env);
  if (!definition) return { output: `  Blueprint not found: ${name}. Run /blueprint to list available automations.` };
  const args = tokens.slice(1), values = parseVarArgs(args);
  try {
    const preview = previewAutomation(definition, values);
    if ("missing" in preview) return { output: missingOutput(name, args, preview.missing) };
    const supplied = args.join(" ");
    return { output: `  Preview ${name}: ${preview.summary}\n  Confirm: vanta automation apply ${name}${supplied ? ` ${supplied}` : ""} --yes` };
  } catch (error) { return { output: `  Blueprint error: ${(error as Error).message}` }; }
};

function missingOutput(name: string, supplied: string[], missing: string[]): string {
  const fields = missing.map((key) => `${key}=<value>`).join(" ");
  return `  Missing: ${missing.join(", ")}\n  Continue: /blueprint ${name}${supplied.length ? ` ${supplied.join(" ")}` : ""} ${fields}`;
}
