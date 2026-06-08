import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export type ReviewCadence = "daily" | "weekly" | "monthly";

export type ReviewPrompt = { cadence: ReviewCadence; prompt: string };

export const REVIEW_PROMPTS: ReviewPrompt[] = [
  {
    cadence: "daily",
    prompt:
      "Quick daily check: what shipped today? What's blocked? What's the single most important thing for tomorrow? Max 5 lines.",
  },
  {
    cadence: "weekly",
    prompt:
      "Weekly review: What shipped this week? What stalled? What decisions do I need to make? What should I drop or park? What's the focus for next week? Max 10 lines.",
  },
  {
    cadence: "monthly",
    prompt:
      "Monthly review: What moved forward? What's the theme of what I've been avoiding? What project needs to die or ship? What do I want to be true in 30 days?",
  },
];

/** Returns the matching ReviewPrompt for the given cadence. Throws on unknown cadence (unreachable invariant). */
export function getReviewPrompt(cadence: ReviewCadence): ReviewPrompt {
  const found = REVIEW_PROMPTS.find((p) => p.cadence === cadence);
  if (!found) throw new Error(`Unknown review cadence: ${cadence}`);
  return found;
}

/** Window sizes in milliseconds for each cadence. */
const WINDOWS: Record<ReviewCadence, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 6.5 * 24 * 60 * 60 * 1000,
  monthly: 27 * 24 * 60 * 60 * 1000,
};

/**
 * Pure. Returns true if the review hasn't run in the expected window.
 * `lastRun` is an ISO string; null → always true.
 */
export function isDue(cadence: ReviewCadence, lastRun: string | null, now: Date): boolean {
  if (lastRun === null) return true;
  const elapsed = now.getTime() - Date.parse(lastRun);
  return elapsed >= WINDOWS[cadence];
}

/** ISO timestamps of the last run for each cadence. */
export type ReviewState = { daily?: string; weekly?: string; monthly?: string };

const REVIEW_STATE_FILE = "review-state.json";

function reviewStatePath(dataDir: string): string {
  return join(dataDir, REVIEW_STATE_FILE);
}

/** Reads .vanta/review-state.json; returns {} on missing or malformed. */
export async function readReviewState(dataDir: string): Promise<ReviewState> {
  try {
    const raw = await readFile(reviewStatePath(dataDir), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as ReviewState;
  } catch {
    return {};
  }
}

/** Writes the review state to .vanta/review-state.json (mkdir -p first). */
export async function writeReviewState(dataDir: string, state: ReviewState): Promise<void> {
  const path = reviewStatePath(dataDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), "utf8");
}
