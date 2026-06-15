import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const RALPH_FILE = "ralph-loop.json";
const statuses = ["pending", "in_progress", "done", "blocked", "dropped"] as const;
export type RalphFeatureStatus = (typeof statuses)[number];

export type RalphFeature = {
  id: string;
  title: string;
  status: RalphFeatureStatus;
  summary?: string;
  files?: string[];
};

export type RalphState = {
  goal: string;
  features: RalphFeature[];
  lastSummary?: string;
  nextAction?: string;
  relevantFiles?: string[];
  updatedAt: string;
};

const FeatureSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(statuses),
  summary: z.string().optional(),
  files: z.array(z.string()).optional(),
});

const StateSchema = z.object({
  goal: z.string().min(1),
  features: z.array(FeatureSchema),
  lastSummary: z.string().optional(),
  nextAction: z.string().optional(),
  relevantFiles: z.array(z.string()).optional(),
  updatedAt: z.string().min(1),
});

function statePath(dataDir: string): string {
  return join(dataDir, RALPH_FILE);
}

export async function readRalphState(dataDir: string): Promise<RalphState | null> {
  try {
    const parsed = StateSchema.safeParse(JSON.parse(await readFile(statePath(dataDir), "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeRalphState(dataDir: string, state: RalphState): Promise<void> {
  const parsed = StateSchema.safeParse(state);
  if (!parsed.success) throw new Error("invalid Ralph loop state");
  await mkdir(dataDir, { recursive: true });
  await writeFile(statePath(dataDir), `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");
}

export function selectNextIncompleteFeature(state: RalphState): RalphFeature | null {
  return state.features.find((f) => f.status === "in_progress" || f.status === "pending" || f.status === "blocked") ?? null;
}

export function updateFeatureStatus(
  state: RalphState,
  id: string,
  status: RalphFeatureStatus,
  opts: { now?: string; summary?: string; nextAction?: string } = {},
): RalphState {
  return {
    ...state,
    features: state.features.map((f) => f.id === id ? { ...f, status, summary: opts.summary ?? f.summary } : f),
    nextAction: opts.nextAction ?? state.nextAction,
    updatedAt: opts.now ?? new Date().toISOString(),
  };
}

export function hasIncompleteRalphWork(state: RalphState): boolean {
  return state.features.some((f) => f.status === "pending" || f.status === "in_progress" || f.status === "blocked");
}

export function dropIncompleteRalphWork(state: RalphState, now = new Date().toISOString()): RalphState {
  return {
    ...state,
    features: state.features.map((f) => hasIncompleteStatus(f.status) ? { ...f, status: "dropped" } : f),
    nextAction: "Dropped by user.",
    updatedAt: now,
  };
}

export function formatRalphContinuityBlock(state: RalphState): string {
  const next = selectNextIncompleteFeature(state);
  const files = [...new Set([...(state.relevantFiles ?? []), ...(next?.files ?? [])])];
  return [
    `Ralph loop progress found — PAUSED.`,
    `Goal: ${state.goal}`,
    next ? `Next incomplete: [${next.id}] ${next.title} (${next.status})` : "Next incomplete: none",
    state.lastSummary ? `Last summary: ${state.lastSummary}` : "",
    state.nextAction ? `Next recommended action: ${state.nextAction}` : "",
    files.length ? `Relevant files: ${files.join(", ")}` : "",
    `Updated: ${state.updatedAt}`,
    `Do NOT act on this carried work until the user explicitly resumes it.`,
    `Use /goal resume to continue or /goal drop to discard it.`,
  ].filter(Boolean).join("\n");
}

function hasIncompleteStatus(status: RalphFeatureStatus): boolean {
  return status === "pending" || status === "in_progress" || status === "blocked";
}
