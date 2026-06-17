import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { resolveMemoryStore } from "../store/memory-store.js";

const FILE = "preferences.jsonl";
const MAX_CONTEXT = 240;

const PairValue = z.object({ label: z.string().min(1), value: z.string().min(1) });
const Provenance = z.object({
  source: z.string().min(1),
  sessionId: z.string().optional(),
  toolName: z.string().optional(),
  actionClass: z.string().optional(),
});

export const PreferenceSignalSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().datetime(),
  kind: z.enum(["approval_decision", "retry", "undo", "edit", "tournament"]),
  context: z.string().max(MAX_CONTEXT),
  chosen: PairValue,
  rejected: PairValue,
  provenance: Provenance,
});

export type PreferenceSignal = z.infer<typeof PreferenceSignalSchema>;

export function preferenceSignalsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), FILE);
}

export async function appendPreferenceSignal(signal: PreferenceSignal, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const parsed = PreferenceSignalSchema.parse(signal);
  await resolveMemoryStore(env).append(FILE, `${JSON.stringify(parsed)}\n`);
}

export async function readPreferenceSignals(env: NodeJS.ProcessEnv = process.env): Promise<PreferenceSignal[]> {
  const raw = (await resolveMemoryStore(env).read(FILE)) ?? "";
  const rows: PreferenceSignal[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parsed = parseLine(line);
    if (parsed) rows.push(parsed);
  }
  return rows;
}

export async function exportPreferenceSignalsJsonl(env: NodeJS.ProcessEnv = process.env): Promise<{ path: string; content: string }> {
  const path = preferenceSignalsPath(env);
  return { path, content: (await readPreferenceSignals(env)).map((s) => JSON.stringify(s)).join("\n") + "\n" };
}

export function signalFromApprovalDecision(input: {
  action: string;
  approved: boolean;
  reason: string;
  sessionId?: string;
  toolName?: string;
}): PreferenceSignal {
  const chosen = input.approved ? "allow" : "deny";
  const rejected = input.approved ? "deny" : "allow";
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    kind: "approval_decision",
    context: sanitizePreferenceContext(`${input.reason}: ${input.action}`),
    chosen: { label: chosen, value: chosen },
    rejected: { label: rejected, value: rejected },
    provenance: {
      source: "human_approval",
      sessionId: input.sessionId,
      toolName: input.toolName,
      actionClass: classifyAction(input.toolName, input.action),
    },
  };
}

export function sanitizePreferenceContext(input: string): string {
  return input
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY|AUTH)[A-Z0-9_]*)=([^\s]+)/gi, "$1=[redacted]")
    .replace(/\b(password|passwd|pwd)\s*[:=]\s*[^\s]+/gi, "$1=[redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,})\b/g, "[redacted]")
    .slice(0, MAX_CONTEXT);
}

function parseLine(line: string): PreferenceSignal | null {
  try {
    const parsed = PreferenceSignalSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function classifyAction(toolName: string | undefined, action: string): string {
  if (/\b(rm -rf|delete|drop table|reset --hard|push --force|publish|deploy|migrate|production)\b/i.test(action)) return "one_way";
  if (/\b(all|every|workspace|system|global|outside)\b/i.test(action)) return "broad_scope";
  if (toolName === "shell_cmd" || toolName === "git_push" || toolName === "workflow") return "risky_tool";
  return "safe_local";
}
