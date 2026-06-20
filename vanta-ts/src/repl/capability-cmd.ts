import { dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  buildCapabilitySurface,
  resolveCapabilityConfig,
  type ChangedFile,
  type ChangeSummary,
} from "../capability/preserve.js";
import { lastIntent } from "./where.js";
import type { ReplCtx, SlashHandler, SlashResult } from "./types.js";

const execFileAsync = promisify(execFile);

/**
 * PAPER-CAPABILITY-PRESERVATION — `/explain` prints the capability-preservation
 * surface for the most recent change set: what changed + WHY in human-graspable
 * terms, plus a comprehension probe on risky/large changes. Opt-in: off unless
 * `VANTA_CAPABILITY_PRESERVE=1` (this command also force-enables on demand).
 *
 * The pure logic lives in `capability/preserve.ts`; this file is the impure
 * adapter that derives a change set from `git diff --stat HEAD`.
 */

/** Parse one `git diff --numstat` line: `<added>\t<deleted>\t<path>`. */
function parseNumstatLine(line: string): ChangedFile | null {
  const parts = line.split("\t");
  if (parts.length < 3) return null;
  const [addRaw, delRaw, ...pathParts] = parts;
  const path = pathParts.join("\t").trim();
  if (!path) return null;
  // Binary files report "-" for both columns; count them as 0/0 but keep the path.
  const additions = addRaw === "-" ? 0 : Number.parseInt(addRaw ?? "", 10);
  const deletions = delRaw === "-" ? 0 : Number.parseInt(delRaw ?? "", 10);
  return {
    path,
    additions: Number.isFinite(additions) ? additions : 0,
    deletions: Number.isFinite(deletions) ? deletions : 0,
  };
}

/** Read the working-tree change set from git, falling back to an empty set on error. */
async function readChangedFiles(repoRoot: string): Promise<ChangedFile[]> {
  try {
    const { stdout } = await execFileAsync("git", ["diff", "--numstat", "HEAD"], { cwd: repoRoot });
    return stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map(parseNumstatLine)
      .filter((f): f is ChangedFile => f !== null);
  } catch {
    return [];
  }
}

function renderSurface(summary: string, probe?: string): string {
  const lines = ["  Capability surface — what changed + why:", ...summary.split("\n").map((l) => `  ${l}`)];
  if (probe) {
    lines.push("", "  ◆ Do you follow this?", `    ${probe}`);
  }
  return lines.join("\n");
}

/** `/explain` — capability-preservation surface for the most recent change set. */
export const explain: SlashHandler = async (arg: string, ctx: ReplCtx): Promise<SlashResult> => {
  // The command itself is an explicit ask to stay in the loop, so honor it even
  // when the always-on env flag is off; `--off` reports the suppressed state.
  const config = resolveCapabilityConfig(ctx.env);
  const enabled = config.enabled || arg.trim().toLowerCase() !== "off";
  if (!enabled) {
    return { output: "  capability-preservation surface is off (VANTA_CAPABILITY_PRESERVE=1 to keep it always on)" };
  }

  const repoRoot = dirname(ctx.dataDir); // dataDir = <repoRoot>/.vanta
  const files = await readChangedFiles(repoRoot);
  if (!files.length) {
    return { output: "  (no uncommitted changes vs HEAD — nothing to explain yet)" };
  }

  // WHY = the operator's last stated intent; the agent's reason for the change set.
  const why = lastIntent(ctx.convo.messages) || "(intent not stated this session)";
  const change: ChangeSummary = { files, why };
  const surface = buildCapabilitySurface(change, { enabled: true });
  return { output: renderSurface(surface.summary, surface.probe) };
};
