import { z } from "zod";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import { runVisionAction, type VisionActionDeps, type VisionActionResult } from "../vision-action/loop.js";
import { resolveVisionProvider } from "../routing/vision.js";
import { buildLiveDeps, cleanupShots } from "./vision-action-run.js";
import { connectChicago, type ChicagoRouter } from "../mcp/chicago-client.js";
import { resolveChicagoConnect } from "../mcp/chicago-connect.js";
import { chicagoEnabled } from "../mcp/chicago-route.js";

const Args = z.object({
  target: z.string().min(1),
  maxAttempts: z.number().int().positive().max(5).optional(),
});

/** One-line-per-step summary of a run. Pure. */
export function formatVisionActionResult(r: VisionActionResult): string {
  const lines = r.steps.map((s, i) => `  ${i + 1}. ${s.status} — ${s.note}`);
  return `${r.ok ? "✓" : "✗"} ${r.note}\n${lines.join("\n")}`;
}

/** Tool core, with the perception/action substrate injectable for tests. */
export async function runVisionActionTool(raw: unknown, ctx: ToolContext, deps?: VisionActionDeps): Promise<ToolResult> {
  const parsed = Args.safeParse(raw);
  if (!parsed.success) return { ok: false, output: 'vision_action needs a "target" string' };
  const { target, maxAttempts } = parsed.data;

  // It commits a click — gate locally too (the kernel already assessed it via
  // describeForSafety; permission prompts stay local even in an SSH session).
  const approved = await ctx.requestApproval(`Vision-guided UI action: click "${target}"`, "executes a grounded click on the screen");
  if (!approved) return { ok: false, output: "denied by user" };

  let live = deps;
  if (!live) {
    try {
      // CHICAGO routing (default-off): only when VANTA_CHICAGO_MCP names a
      // configured computer-use MCP server do we connect it and route the click
      // through its mounted `computer` tool instead of the local cliclick driver.
      // A failed connect yields a fail-closed router (never throws). Unset env →
      // router stays null → the local path is byte-identical. The click was
      // already kernel-gated above (MCP is the WHERE, the kernel is the WHETHER).
      const router: ChicagoRouter | null = chicagoEnabled(process.env)
        ? await connectChicago(process.env, resolveChicagoConnect(process.env))
        : null;
      live = buildLiveDeps(resolveVisionProvider(process.env), router);
    } catch (err) {
      return { ok: false, output: `vision_action needs a vision model: ${(err as Error).message}` };
    }
  }
  try {
    const result = await runVisionAction(target, live, { maxAttempts });
    if (!deps) await cleanupShots(result); // only the live path writes temp shots
    return { ok: result.ok, output: formatVisionActionResult(result) };
  } catch (err) {
    return { ok: false, output: `vision_action failed: ${(err as Error).message}` };
  }
}

export const visionActionTool: Tool = {
  schema: {
    name: "vision_action",
    description:
      "Locate a UI target from a screenshot and execute one grounded click, then re-observe to confirm the " +
      "screen changed — detecting a mis-click and retrying. Vanta's perceive→ground→act→verify loop. " +
      "macOS: needs a vision model + Screen Recording permission + the 'cliclick' helper for OS-level clicks.",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string", description: "The on-screen UI target to act on, in plain language (e.g. 'the blue Login button')" },
        maxAttempts: { type: "number", description: "Re-observe/retry attempts on a mis-click (default 2, max 5)" },
      },
      required: ["target"],
    },
  },
  describeForSafety: (a) => `vision-guided click on UI target "${String(a.target ?? "")}"`,
  execute: (raw, ctx) => runVisionActionTool(raw, ctx),
};
