import { createHash, randomUUID } from "node:crypto";
import { appendFile, chmod, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { resolveVantaHome } from "../store/home.js";
import { hasSecrets } from "../store/secret-scan.js";
import { redactForLog } from "../store/redact-structural.js";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_RUN_BYTES = 50 * 1024 * 1024;
const PRIVATE_FILE = /(^|\/)(?:\.env(?:\.[^/]*)?|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*)?|[^/]+\.(?:pem|key|p12|pfx))$/i;
const PRIVATE_DIR = /(^|\/)(?:\.git|\.vanta|\.ssh|\.aws|\.gnupg)(?:\/|$)/i;
const SECRET_KEY = /(?:authorization|cookie|token|secret|password|passwd|api[_-]?key|credential)/i;

export const RunInputSchema = z.object({
  path: z.string(),
  sha256: z.string().optional(),
  bytes: z.number().int().nonnegative().optional(),
  snapshotRef: z.string().optional(),
  capture: z.enum(["snapshotted", "linked", "missing", "redacted"]),
  note: z.string().optional(),
});

export const RunEventSchema = z.object({
  at: z.string(),
  kind: z.enum(["tool_start", "tool_end", "approval", "note"]),
  toolName: z.string().optional(),
  ok: z.boolean().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  output: z.string().optional(),
  approval: z.object({
    decision: z.enum(["allow", "always", "deny", "never"]),
    reason: z.string(),
  }).optional(),
});

export const RunLineageSchema = z.object({
  mode: z.enum(["original", "fork", "replay"]),
  parentRunId: z.string().optional(),
});

export const RunRecordSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  sessionId: z.string(),
  turnIndex: z.number().int().nonnegative(),
  title: z.string(),
  prompt: z.string(),
  projectRoot: z.string(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  startedAt: z.string(),
  completedAt: z.string(),
  status: z.enum(["done", "failed", "interrupted"]),
  saved: z.boolean(),
  tags: z.array(z.string()),
  provenance: z.enum(["captured", "derived"]),
  lineage: RunLineageSchema,
  inputs: z.array(RunInputSchema),
  events: z.array(RunEventSchema),
  finalOutput: z.string(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }).optional(),
});

export type RunInput = z.infer<typeof RunInputSchema>;
export type RunEvent = z.infer<typeof RunEventSchema>;
export type RunLineage = z.infer<typeof RunLineageSchema>;
export type RunRecord = z.infer<typeof RunRecordSchema>;

export type ReplayInputState = {
  path: string;
  expectedSha256?: string;
  actualSha256?: string;
  state: "ready" | "changed" | "missing" | "redacted";
};

export type ReplayPreview = {
  runId: string;
  canExecute: boolean;
  project: { recorded: string; current: string; changed: boolean };
  provider: { recorded?: string; current?: string; changed: boolean };
  model: { recorded?: string; current?: string; changed: boolean };
  tools: { recorded: string[]; unavailable: string[] };
  inputs: ReplayInputState[];
  warning: string;
};

export type RunLibraryMetric =
  | "run_captured"
  | "run_saved"
  | "run_unsaved"
  | "run_fork_prepared"
  | "run_replay_blocked"
  | "run_replay_prepared"
  | "run_reuse_submitted"
  | "run_reuse_completed"
  | "run_deleted";

function runsDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveVantaHome(env), "runs");
}

function recordPath(id: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(runsDir(env), `${safeId(id)}.json`);
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function newRunId(): string {
  return randomUUID();
}

export async function appendRunLibraryMetric(
  event: RunLibraryMetric,
  fields: {
    status?: RunRecord["status"];
    driftCount?: number;
    mode?: Exclude<RunLineage["mode"], "original">;
    elapsedMs?: number;
  } = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const path = join(runsDir(env), "metrics.jsonl");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await appendFile(path, `${JSON.stringify({ version: 1, at: new Date().toISOString(), event, ...fields })}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

async function writeRunRecord(record: RunRecord, env: NodeJS.ProcessEnv): Promise<RunRecord> {
  const candidate = RunRecordSchema.parse(record);
  const parsed = RunRecordSchema.parse({
    ...candidate,
    title: redactForLog(candidate.title),
    prompt: redactForLog(candidate.prompt),
    finalOutput: redactForLog(candidate.finalOutput),
    inputs: candidate.inputs.map((input) => ({
      ...input,
      path: redactForLog(input.path),
      ...(input.note ? { note: redactForLog(input.note) } : {}),
    })),
    events: candidate.events.map((event) => ({
      ...event,
      ...(event.args ? { args: redactValue(event.args) as Record<string, unknown> } : {}),
      ...(event.output ? { output: redactForLog(event.output) } : {}),
      ...(event.approval ? { approval: { ...event.approval, reason: redactForLog(event.approval.reason) } } : {}),
    })),
  });
  const path = recordPath(parsed.id, env);
  const temporary = `${path}.${process.pid}.tmp`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
  await chmod(path, 0o600);
  return parsed;
}

export async function saveRun(record: RunRecord, env: NodeJS.ProcessEnv = process.env): Promise<RunRecord> {
  const parsed = await writeRunRecord(record, env);
  await appendRunLibraryMetric("run_captured", { status: parsed.status }, env).catch(() => undefined);
  return parsed;
}

export async function loadRun(id: string, env: NodeJS.ProcessEnv = process.env): Promise<RunRecord | null> {
  try {
    const parsed = RunRecordSchema.safeParse(JSON.parse(await readFile(recordPath(id, env), "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function listRuns(
  options: { savedOnly?: boolean; query?: string } = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<RunRecord[]> {
  let files: string[];
  try {
    files = (await readdir(runsDir(env))).filter((file) => file.endsWith(".json"));
  } catch {
    return [];
  }
  const records = (await Promise.all(files.map(async (file) => {
    try {
      const parsed = RunRecordSchema.safeParse(JSON.parse(await readFile(join(runsDir(env), file), "utf8")));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }))).filter((record): record is RunRecord => Boolean(record));
  const query = options.query?.trim().toLowerCase();
  return records
    .filter((record) => !options.savedOnly || record.saved)
    .filter((record) => !query || `${record.title}\n${record.prompt}\n${record.inputs.map((input) => input.path).join("\n")}\n${record.events.map((event) => event.toolName ?? "").join("\n")}`.toLowerCase().includes(query))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

export async function setRunSaved(
  id: string,
  saved: boolean,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RunRecord | null> {
  const record = await loadRun(id, env);
  if (!record) return null;
  const updated = await writeRunRecord({ ...record, saved }, env);
  await appendRunLibraryMetric(saved ? "run_saved" : "run_unsaved", {}, env).catch(() => undefined);
  return updated;
}

export async function deleteRun(id: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await rm(recordPath(id, env), { force: true });
  await rm(join(runsDir(env), "files", safeId(id)), { recursive: true, force: true });
}

export async function deleteUnsavedRunsForSession(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const records = (await listRuns({}, env)).filter((record) => record.sessionId === sessionId && !record.saved);
  await Promise.all(records.map((record) => deleteRun(record.id, env)));
  return records.length;
}

function safeProjectPath(root: string, path: string): { relativePath: string; absolutePath: string } | null {
  if (!path.trim() || isAbsolute(path) || PRIVATE_FILE.test(path) || PRIVATE_DIR.test(path)) return null;
  const absolutePath = resolve(root, path);
  const relativePath = relative(root, absolutePath);
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(relativePath)) return null;
  return { relativePath, absolutePath };
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function captureRunInputs(
  root: string,
  files: string[],
  runId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RunInput[]> {
  const inputs: RunInput[] = [];
  let snapshottedBytes = 0;
  for (const requested of [...new Set(files)]) {
    const safe = safeProjectPath(root, requested);
    if (!safe) {
      inputs.push({ path: requested, capture: "redacted", note: "Excluded by the private-file or project-scope policy." });
      continue;
    }
    try {
      const info = await stat(safe.absolutePath);
      if (!info.isFile()) {
        inputs.push({ path: safe.relativePath, capture: "missing", note: "Input is not a regular file." });
        continue;
      }
      const bytes = await readFile(safe.absolutePath);
      const base: RunInput = { path: safe.relativePath, bytes: bytes.length, sha256: sha256(bytes), capture: "linked" };
      if (bytes.length > MAX_FILE_BYTES || snapshottedBytes + bytes.length > MAX_RUN_BYTES) {
        inputs.push({ ...base, note: "Linked only because the safe snapshot size limit was reached." });
        continue;
      }
      if (hasSecrets(bytes.toString("utf8"))) {
        inputs.push({ ...base, capture: "redacted", note: "Snapshot excluded because a credential pattern was detected." });
        continue;
      }
      const snapshotRef = join("files", safeId(runId), `${inputs.length}-${basename(safe.relativePath)}`);
      const destination = join(runsDir(env), snapshotRef);
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, bytes, { mode: 0o600 });
      snapshottedBytes += bytes.length;
      inputs.push({ ...base, capture: "snapshotted", snapshotRef });
    } catch {
      inputs.push({ path: safe.relativePath, capture: "missing", note: "Input was unavailable when the run started." });
    }
  }
  return inputs;
}

function redactValue(value: unknown, key = "", depth = 0): unknown {
  if (SECRET_KEY.test(key)) return "***";
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") return redactForLog(value).slice(0, 4_000);
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => redactValue(entry, "", depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 100).map(([entryKey, entry]) => [entryKey, redactValue(entry, entryKey, depth + 1)]));
  }
  return value;
}

export function runEventFromTool(event: {
  type: "tool_start"; name: string; args: Record<string, unknown>;
} | {
  type: "tool_end"; name: string; ok: boolean; output: string;
}, at = new Date().toISOString()): RunEvent {
  if (event.type === "tool_start") {
    return {
      at,
      kind: "tool_start",
      toolName: event.name,
      args: redactValue(event.args) as Record<string, unknown>,
    };
  }
  return {
    at,
    kind: "tool_end",
    toolName: event.name,
    ok: event.ok,
    output: redactForLog(event.output).slice(0, 8_000),
  };
}

export function approvalRunEvent(
  toolName: string | undefined,
  reason: string,
  decision: "allow" | "always" | "deny" | "never",
  at = new Date().toISOString(),
): RunEvent {
  return {
    at,
    kind: "approval",
    ...(toolName ? { toolName } : {}),
    ok: decision === "allow" || decision === "always",
    approval: { decision, reason: redactForLog(reason).slice(0, 2_000) },
  };
}

export async function previewReplay(
  record: RunRecord,
  current: { projectRoot: string; providerId?: string; modelId?: string; tools: string[] },
): Promise<ReplayPreview> {
  const inputs: ReplayInputState[] = [];
  for (const input of record.inputs) {
    if (input.capture === "redacted") {
      inputs.push({ path: input.path, expectedSha256: input.sha256, state: "redacted" });
      continue;
    }
    const safe = safeProjectPath(current.projectRoot, input.path);
    if (!safe) {
      inputs.push({ path: input.path, expectedSha256: input.sha256, state: "missing" });
      continue;
    }
    try {
      const actualSha256 = sha256(await readFile(safe.absolutePath));
      inputs.push({
        path: input.path,
        expectedSha256: input.sha256,
        actualSha256,
        state: !input.sha256 || actualSha256 === input.sha256 ? "ready" : "changed",
      });
    } catch {
      inputs.push({ path: input.path, expectedSha256: input.sha256, state: "missing" });
    }
  }
  const recordedTools = [...new Set(record.events.map((event) => event.toolName).filter((name): name is string => Boolean(name)))];
  const available = new Set(current.tools);
  const unavailable = recordedTools.filter((tool) => !available.has(tool));
  const blocked = inputs.some((input) => input.state !== "ready");
  return {
    runId: record.id,
    canExecute: !blocked,
    project: { recorded: record.projectRoot, current: current.projectRoot, changed: record.projectRoot !== current.projectRoot },
    provider: { recorded: record.providerId, current: current.providerId, changed: record.providerId !== current.providerId },
    model: { recorded: record.modelId, current: current.modelId, changed: record.modelId !== current.modelId },
    tools: { recorded: recordedTools, unavailable },
    inputs,
    warning: "Replay creates a fresh run. Recorded tools and approvals are never executed or reused.",
  };
}
