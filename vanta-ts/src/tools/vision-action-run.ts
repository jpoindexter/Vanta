import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { LLMProvider } from "../providers/interface.js";
import type { Observation, GroundedTarget, VisionActionDeps, VisionActionResult } from "../vision-action/loop.js";
import { chicagoEnabled } from "../mcp/chicago-route.js";
import { makeChicagoRouter, type CallMcp, type ChicagoRouter } from "../mcp/chicago-client.js";

// Live substrate for the vision→action loop. The PURE parsers/arg-builders are
// unit-tested here; the live I/O (screencapture, the vision model, cliclick) is
// the documented boundary — macOS + Screen Recording permission + a vision model
// + the `cliclick` helper. Each parser fails SAFE (not-found / SAME) so an
// ambiguous model reply becomes a retry, never a false success.

const run = promisify(execFile);
let shotSeq = 0;

const GroundSchema = z.object({
  found: z.boolean(),
  x: z.number().optional(),
  y: z.number().optional(),
  label: z.string().optional(),
});

/** Extract the first balanced-ish JSON object from a model reply (handles code
 *  fences / surrounding prose). Returns null when there's nothing parseable. */
function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Parse the grounding reply into a target. Requires found=true AND numeric
 *  coordinates; anything else is not-found (recover/scroll). Pure. */
export function parseGroundResponse(text: string): GroundedTarget {
  const parsed = GroundSchema.safeParse(extractJsonObject(text));
  if (!parsed.success || !parsed.data.found) return { found: false };
  const { x, y, label } = parsed.data;
  if (typeof x !== "number" || typeof y !== "number") return { found: false };
  return { found: true, x, y, label };
}

/** Parse a change verdict. SAME/UNCHANGED → false; CHANGED → true; ambiguous →
 *  false (treat as a mis-click and retry, never a false success). Pure. */
export function parseChangedResponse(text: string): boolean {
  const t = text.toUpperCase();
  if (t.includes("UNCHANGED") || t.includes("SAME")) return false;
  return t.includes("CHANGED");
}

/** cliclick argument for a center click at (x, y). Pure. */
export function clickArgs(x: number, y: number): string[] {
  return [`c:${Math.round(x)},${Math.round(y)}`];
}

/** Unique shot paths produced during a run, for cleanup. Pure. */
export function collectShots(result: VisionActionResult): string[] {
  const shots = new Set<string>();
  for (const s of result.steps) {
    shots.add(s.before.shot);
    if (s.after) shots.add(s.after.shot);
  }
  return [...shots];
}

export const GROUND_PROMPT = (target: string): string =>
  `Locate the UI target "${target}" in this screenshot. Reply ONLY with JSON: ` +
  `{"found": true|false, "x": <pixels from left>, "y": <pixels from top>, "label": "<what you see>"}. ` +
  `Use the CENTER of the target. If it isn't visible, reply {"found": false}.`;

export const CHANGE_PROMPT =
  `These two screenshots were taken just before and just after a click. Did the UI meaningfully change in ` +
  `response (navigation, new content, an opened menu, a focus change)? Ignore the clock and the mouse cursor. ` +
  `Reply with exactly one word: CHANGED or SAME.`;

async function captureScreen(): Promise<Observation> {
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const tmp = join(tmpdir(), `vanta-va-${process.pid}-${shotSeq++}.png`);
  await run("screencapture", ["-x", tmp]);
  return { shot: tmp };
}

async function imageMessage(shot: string): Promise<{ mime: string; dataBase64: string }> {
  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(shot);
  return { mime: "image/png", dataBase64: buf.toString("base64") };
}

async function clickAt(x: number, y: number): Promise<void> {
  try {
    await run("cliclick", clickArgs(x, y));
  } catch (err) {
    throw new Error(`OS-level click needs the 'cliclick' helper (brew install cliclick): ${(err as Error).message}`);
  }
}

/** Best-effort removal of the temp screenshots a run produced. */
export async function cleanupShots(result: VisionActionResult): Promise<void> {
  const { rm } = await import("node:fs/promises");
  await Promise.all(collectShots(result).map((p) => rm(p, { force: true }).catch(() => {})));
}

/**
 * Resolve the CHICAGO actuator for this run, or null when routing is off.
 * When `chicagoEnabled(env)` is true AND a raw MCP call seam is supplied, the
 * ACTUATION (the click) is routed through a mounted CHICAGO `computer` tool
 * instead of the local `cliclick` driver. Default-off: unset env → null →
 * `buildLiveDeps` keeps the byte-identical local path. The kernel `assess()`
 * gate is UPSTREAM (the `vision_action` tool gates the click before the loop
 * runs), so a routed click is gated identically to a local one. Pure given the
 * injected `callMcp`.
 */
export function chicagoActuator(env: NodeJS.ProcessEnv, callMcp?: CallMcp): ChicagoRouter | null {
  if (!chicagoEnabled(env) || !callMcp) return null;
  return makeChicagoRouter({ callMcp, server: env.VANTA_CHICAGO_MCP ?? "chicago" });
}

/** Wire the loop to the real macOS substrate, grounding + change-detection via a
 *  vision provider. Live needs documented above. When CHICAGO routing is enabled
 *  (`router` supplied), the click is actuated through the mounted MCP `computer`
 *  tool instead of cliclick; perception + vision reasoning stay local. */
export function buildLiveDeps(provider: LLMProvider, router?: ChicagoRouter | null): VisionActionDeps {
  return {
    perceive: captureScreen,
    ground: async (target, obs) => {
      const r = await provider.complete([{ role: "user", content: GROUND_PROMPT(target), images: [await imageMessage(obs.shot)] }], []);
      return parseGroundResponse(r.text ?? "");
    },
    act: async (g) => {
      if (typeof g.x !== "number" || typeof g.y !== "number") throw new Error("grounded target has no coordinates to click");
      if (router) {
        const routed = await router.run({ kind: "click", x: g.x, y: g.y });
        if (!routed.ok) throw new Error(`CHICAGO MCP click failed: ${routed.error}`);
        return;
      }
      await clickAt(g.x, g.y);
    },
    changed: async (before, after) => {
      const imgs = [await imageMessage(before.shot), await imageMessage(after.shot)];
      const r = await provider.complete([{ role: "user", content: CHANGE_PROMPT, images: imgs }], []);
      return parseChangedResponse(r.text ?? "");
    },
  };
}
