import type { ToolResult } from "./types.js";
import {
  snapshot, compareSnapshot, updateBaseline, snapshotsDir,
  type CompareResult,
} from "../taste/visual-regression.js";

// Visual-regression actions for the taste surface. The screenshot SOURCE is
// INJECTED (CaptureSource) so tests pass PNG bytes directly and never touch a
// browser; live use resolves the playwright capability in resolve-capture.ts.
// Every action writes only under ~/.vanta/taste-snapshots → kernel Allow.

/** Capture a PNG for a target (a URL or in-scope path) → raw bytes. */
export type CaptureSource = (target: string) => Promise<Buffer>;

export type VisualArgs = {
  name: string;
  target?: string;
  /** Test/back-door: inject bytes directly, skipping the capture source. */
  pngBytes?: Buffer;
};

const NO_SOURCE =
  "visual snapshots need a screenshot source — run `npx playwright install chromium` (or pass a target the browser can reach)";

async function resolveBytes(
  a: VisualArgs,
  capture: CaptureSource | null,
): Promise<{ ok: true; bytes: Buffer } | ToolResult> {
  if (a.pngBytes) return { ok: true, bytes: a.pngBytes };
  if (!capture) return { ok: false, output: NO_SOURCE };
  if (!a.target) return { ok: false, output: "snapshot/regress needs a target (url or in-scope path)" };
  try {
    return { ok: true, bytes: await capture(a.target) };
  } catch (err) {
    return { ok: false, output: `${NO_SOURCE} — ${(err as Error).message}` };
  }
}

function dims(d?: { width: number; height: number }): string {
  return d ? `${d.width}x${d.height}` : "?";
}

function formatCompare(name: string, r: CompareResult): ToolResult {
  if (r.verdict === "no-baseline") {
    return {
      ok: true,
      output: `no baseline for "${name}" (${dims(r.current)}) — run action:snapshot first to lock one`,
    };
  }
  if (r.verdict === "match") {
    return { ok: true, output: `visual match — "${name}" unchanged (${dims(r.current)})` };
  }
  const what = r.reason === "dimensions-changed"
    ? `dimensions changed ${dims(r.baseline)} → ${dims(r.current)}`
    : `pixels changed (${dims(r.current)})`;
  return {
    ok: false,
    output: `VISUAL REGRESSION — "${name}": ${what}. Current image saved to ${r.currentPath} (rebaseline with action:rebaseline if intended)`,
  };
}

/** action:snapshot — lock a baseline. */
export async function doSnapshot(a: VisualArgs, capture: CaptureSource | null): Promise<ToolResult> {
  const got = await resolveBytes(a, capture);
  if (!("bytes" in got)) return got;
  try {
    const meta = await snapshot(a.name, got.bytes, snapshotsDir());
    return { ok: true, output: `baseline locked — "${a.name}" (${meta.width}x${meta.height}, ${meta.hash.slice(0, 12)})` };
  } catch (err) {
    return { ok: false, output: `cannot snapshot "${a.name}": ${(err as Error).message}` };
  }
}

/** action:regress — compare current capture against the baseline. */
export async function doRegress(a: VisualArgs, capture: CaptureSource | null): Promise<ToolResult> {
  const got = await resolveBytes(a, capture);
  if (!("bytes" in got)) return got;
  try {
    return formatCompare(a.name, await compareSnapshot(a.name, got.bytes, snapshotsDir()));
  } catch (err) {
    return { ok: false, output: `cannot compare "${a.name}": ${(err as Error).message}` };
  }
}

/** action:rebaseline — accept the current capture as the new baseline. */
export async function doRebaseline(a: VisualArgs, capture: CaptureSource | null): Promise<ToolResult> {
  const got = await resolveBytes(a, capture);
  if (!("bytes" in got)) return got;
  try {
    const meta = await updateBaseline(a.name, got.bytes, snapshotsDir());
    return { ok: true, output: `baseline updated — "${a.name}" (${meta.width}x${meta.height}, ${meta.hash.slice(0, 12)})` };
  } catch (err) {
    return { ok: false, output: `cannot rebaseline "${a.name}": ${(err as Error).message}` };
  }
}
