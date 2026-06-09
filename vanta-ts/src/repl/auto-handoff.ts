import { readFile, writeFile, stat, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Goal, Message } from "../types.js";

// AUTO-HANDOFF — the auto trigger on top of HANDOFF-PACKET. When context crosses
// a fill threshold, write a durable resume block to .vanta/handoff.md; on the
// next INTERACTIVE launch, inject it into the system prompt and consume it, so a
// restart/fresh session continues from prior state with no manual "give me a
// handoff" ritual. Context economy is the #1 recurring chore from usage mining.

export const DEFAULT_AUTOHANDOFF_THRESHOLD = 0.75;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // a stale resume is worse than none
const FILE = "handoff.md";

/** Fraction of context [0..1) that triggers an auto-handoff. Env override, clamped. */
export function resolveAutoHandoffThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.VANTA_AUTOHANDOFF_THRESHOLD);
  if (!Number.isFinite(raw) || raw <= 0 || raw > 1) return DEFAULT_AUTOHANDOFF_THRESHOLD;
  return raw;
}

/** Fires when the context fill fraction meets/exceeds the threshold. Pure. */
export function shouldAutoHandoff(estTokens: number, contextWindow: number, threshold = DEFAULT_AUTOHANDOFF_THRESHOLD): boolean {
  if (contextWindow <= 0 || estTokens <= 0) return false;
  return estTokens / contextWindow >= threshold;
}

export function autoHandoffPath(dataDir: string): string {
  return join(dataDir, FILE);
}

/** Write the resume block to .vanta/handoff.md (overwrite — always the latest state). */
export async function writeAutoHandoff(dataDir: string, packet: string): Promise<string> {
  await mkdir(dataDir, { recursive: true });
  const path = autoHandoffPath(dataDir);
  await writeFile(path, packet, "utf8");
  return path;
}

/** Read the saved resume block iff it exists and is recent (default ≤7d). */
export async function readAutoHandoff(
  dataDir: string,
  opts: { maxAgeMs?: number; now?: Date } = {},
): Promise<string | null> {
  const path = autoHandoffPath(dataDir);
  try {
    const s = await stat(path);
    const now = (opts.now ?? new Date()).getTime();
    if (now - s.mtimeMs > (opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS)) return null;
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/** Delete the consumed resume block (best-effort). */
export async function clearAutoHandoff(dataDir: string): Promise<void> {
  await rm(autoHandoffPath(dataDir), { force: true }).catch(() => {});
}

/** Post-turn: write a resume block when context crosses the threshold. Returns
 *  whether it wrote so the host can surface a one-time note. Best-effort. */
export async function maybeAutoHandoff(opts: {
  estTokens: number;
  contextWindow: number;
  messages: Message[];
  sessionId: string;
  provider: string;
  model: string;
  repoRoot: string;
  safety: { getGoals: () => Promise<Goal[]> };
  now: Date;
  env?: NodeJS.ProcessEnv;
}): Promise<{ wrote: boolean; path?: string }> {
  const env = opts.env ?? process.env;
  if (env.VANTA_AUTOHANDOFF === "0") return { wrote: false };
  if (!shouldAutoHandoff(opts.estTokens, opts.contextWindow, resolveAutoHandoffThreshold(env))) return { wrote: false };
  try {
    const { assembleHandoff } = await import("./handoff-cmd.js");
    const packet = await assembleHandoff({
      messages: opts.messages,
      sessionId: opts.sessionId,
      provider: opts.provider,
      model: opts.model,
      repoRoot: opts.repoRoot,
      safety: opts.safety,
      now: opts.now,
    });
    const path = await writeAutoHandoff(join(opts.repoRoot, ".vanta"), packet);
    return { wrote: true, path };
  } catch {
    return { wrote: false };
  }
}
