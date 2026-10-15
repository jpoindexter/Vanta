import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { relative } from "node:path";
import { resolveInScope } from "../scope.js";
import { defaultNdSupport } from "../nd/engine.js";
import type { CaptureContinuity, ContinuityItem } from "./types.js";

const sha256 = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");

export type SourceEvidence = { source: string; target: string; sha256: string };

const projectFileMention = /(?:^|\s)@([^\s]+\.(?:md|txt|json|ya?ml|toml|tsx?|jsx?|mjs|cjs|rs|css|html?))(?=$|\s|[.,;:!?])/i;

export function mentionedSourcePath(text: string): string | undefined {
  return text.match(projectFileMention)?.[1];
}

export async function captureSource(root: string, sourcePath?: string): Promise<SourceEvidence> {
  if (!sourcePath) return { source: "user-capture", target: "private continuity note", sha256: sha256("user-capture") };
  const scoped = resolveInScope(sourcePath, root);
  if (!scoped.ok || relative(root, scoped.path).startsWith(".vanta")) throw new Error("sourcePath must name a project file outside .vanta");
  const info = await stat(scoped.path);
  if (!info.isFile()) throw new Error("sourcePath must name a regular file");
  const bytes = await readFile(scoped.path);
  const target = relative(root, scoped.path);
  return { source: `local-file:${target}`, target, sha256: sha256(bytes) };
}

export function buildContinuityItem(
  input: CaptureContinuity,
  source: SourceEvidence,
  id: string,
  at: string,
): ContinuityItem {
  const capacity = { ...defaultNdSupport().capacity, ...input.capacity };
  const preview = source.source === "user-capture"
    ? "Review the private capture. No project files will change. Result: one exact next action."
    : `Read ${source.target}. No project files will change. Result: one exact next action from the first unfinished item.`;
  return {
    version: 1,
    id,
    outcome: input.text,
    source: source.source,
    state: "queued",
    owner: "Vanta",
    waitCondition: "Not started",
    nextAction: `Review ${source.target}`,
    resumeContext: `Captured from ${source.source}; no action has run yet.`,
    provenanceMemory: [{ source: source.source, sourceId: source.target, capturedAt: at }],
    followUp: { condition: "Review when it fits" },
    timeCapacityFit: { minutes: 10, capacity },
    blocker: "Not started",
    artifacts: [{ kind: "note", ref: `continuity:${id}:source`, sha256: source.sha256 }],
    recommendation: source.source === "user-capture"
      ? "Review this private capture and choose one concrete next action"
      : `Read ${source.target} and choose the first unfinished action`,
    choices: ["do it", "show me", "snooze"],
    preparedAction: { kind: "read_local_file", target: source.target, minutes: 10, reversible: true, preview },
    updatedAt: at,
  };
}

export function firstUnfinishedAction(raw: string, fallback: string): string {
  const checklist = raw.match(/^\s*[-*]\s+\[ \]\s+(.+)$/m)?.[1]?.trim();
  if (checklist) return checklist.replace(/[.!?]+$/, "");
  const todo = raw.match(/^\s*(?:TODO|NEXT)[:\s-]+(.+)$/im)?.[1]?.trim();
  if (todo) return todo.replace(/[.!?]+$/, "");
  return fallback;
}

export async function executePreparedRead(root: string, item: ContinuityItem): Promise<{ sha256: string; nextAction: string }> {
  if (item.source === "user-capture") {
    return { sha256: sha256(item.outcome), nextAction: `Choose the first reversible step for: ${item.outcome}` };
  }
  const scoped = resolveInScope(item.preparedAction.target, root);
  if (!scoped.ok) throw new Error("prepared source left the project scope");
  const bytes = await readFile(scoped.path);
  const currentHash = sha256(bytes);
  const capturedHash = item.artifacts.find((artifact) => artifact.ref.endsWith(":source"))?.sha256;
  if (capturedHash && capturedHash !== currentHash) throw new Error("source changed after capture; review it before continuing");
  return { sha256: currentHash, nextAction: firstUnfinishedAction(bytes.toString("utf8"), `Review ${item.preparedAction.target}`) };
}

export const actionSha256 = (item: ContinuityItem): string => sha256(JSON.stringify(item.preparedAction));
