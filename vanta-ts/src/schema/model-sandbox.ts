import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { redactForLog } from "../store/redact-structural.js";

export type ModelSandboxStatus =
  | "completed"
  | "sandbox_unavailable"
  | "sandbox_violation"
  | "timeout"
  | "memory_limit"
  | "output_limit"
  | "runtime_error"
  | "nondeterministic";

export type ModelSandboxLimits = { timeoutMs: number; memoryMb: number; maxOutputBytes: number };
export type ModelSandboxReceipt = {
  version: 1;
  modelHash: string;
  status: ModelSandboxStatus;
  startedAt: string;
  durationMs: number;
  network: "denied";
  environment: "empty";
  filesystem: "disposable-workspace-only";
  limits: ModelSandboxLimits;
  error?: string;
};
export type ModelSandboxInput = { state: unknown; action: unknown; timeline: readonly unknown[] };
export type ModelSandboxResult =
  | { ok: true; predicted: unknown; goal: boolean; receipt: ModelSandboxReceipt }
  | { ok: false; error: string; receipt: ModelSandboxReceipt };

type ExecuteOptions = {
  source: string;
  input: ModelSandboxInput;
  limits?: Partial<ModelSandboxLimits>;
  platform?: NodeJS.Platform;
  recordReceipt(receipt: ModelSandboxReceipt): Promise<void>;
};
type ChildResult =
  | { ok: true; predicted: unknown; goal: boolean }
  | { ok: false; status: Exclude<ModelSandboxStatus, "completed" | "nondeterministic" | "sandbox_unavailable">; error: string };

const DEFAULT_LIMITS: ModelSandboxLimits = { timeoutMs: 2_000, memoryMb: 64, maxOutputBytes: 64_000 };
const RUNNER = `
import { readFileSync } from "node:fs";
import { Script, createContext } from "node:vm";

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

try {
  const source = readFileSync(process.argv[2], "utf8");
  const input = freeze(JSON.parse(readFileSync(process.argv[3], "utf8")));
  const timeout = Number(process.argv[4]);
  const context = createContext(Object.assign(Object.create(null), { input }), {
    codeGeneration: { strings: false, wasm: false },
  });
  new Script(
    'Object.defineProperty(globalThis, "constructor", { value: undefined, writable: false, configurable: false });' +
    'Object.defineProperty(Function.prototype, "constructor", { value: undefined, writable: false, configurable: false });'
  ).runInContext(context, { timeout });
  context.model = new Script("(" + source + ")", { filename: "task-model.js" }).runInContext(context, { timeout });
  const result = new Script("(() => { const predicted = model.step(input); return { predicted, goal: Boolean(model.isGoal(predicted)) }; })()")
    .runInContext(context, { timeout });
  process.stdout.write(JSON.stringify({ ok: true, ...result }));
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: { name: error?.name ?? "Error", message: error?.message ?? String(error) } }));
  process.exitCode = 1;
}
`;

function sb(path: string): string {
  return `"${path.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** A model-specific Seatbelt profile: unlike the general tool sandbox, reads are not ambient. */
export function buildModelSeatbeltProfile(workspace: string, nodePath: string): string {
  const root = resolve(workspace);
  const node = resolve(nodePath);
  const privateTmp = realpathSync(tmpdir());
  const denied = [...new Set([resolve(homedir()), privateTmp, "/private/tmp"])];
  return [
    "(version 1)",
    "(deny default)",
    `(allow process-exec* (literal ${sb(node)}))`,
    "(allow process-fork)",
    "(allow signal (target self))",
    "(allow sysctl-read)",
    "(allow mach-lookup)",
    "; system/runtime reads are allowed, then operator and temp data are denied",
    "(allow file-read*)",
    ...denied.map((path) => `(deny file* (subpath ${sb(path)}))`),
    "; last-match-wins: re-open only the bundled Node runtime and model workspace",
    `(allow file-read* (subpath ${sb(dirname(node))}))`,
    `(allow file-read* (subpath ${sb(root)}))`,
    `(allow file-read* (literal ${sb(node)}))`,
    `(allow file-write* (subpath ${sb(root)}))`,
    `(allow file-write-data (literal ${sb("/dev/null")}))`,
    `(allow file-write-data (literal ${sb("/dev/stdout")}))`,
    `(allow file-write-data (literal ${sb("/dev/stderr")}))`,
    "(deny network*)",
    "",
  ].join("\n");
}

function limitsFrom(input?: Partial<ModelSandboxLimits>): ModelSandboxLimits {
  return {
    timeoutMs: Math.max(25, Math.min(input?.timeoutMs ?? DEFAULT_LIMITS.timeoutMs, 10_000)),
    memoryMb: Math.max(16, Math.min(input?.memoryMb ?? DEFAULT_LIMITS.memoryMb, 512)),
    maxOutputBytes: Math.max(1_024, Math.min(input?.maxOutputBytes ?? DEFAULT_LIMITS.maxOutputBytes, 1_000_000)),
  };
}

function killGroup(pid: number | undefined): void {
  if (!pid) return;
  try { process.kill(-pid, "SIGKILL"); } catch { /* already exited */ }
}

function classifyError(message: string, stderr: string): ChildResult {
  const combined = `${message}\n${stderr}`;
  if (/script execution timed out|timed out/i.test(combined)) {
    return { ok: false, status: "timeout", error: "model exceeded its time limit" };
  }
  if (/heap out of memory|allocation failed|ineffective mark-compacts/i.test(combined)) {
    return { ok: false, status: "memory_limit", error: "model exceeded its memory limit" };
  }
  if (/operation not permitted|sandbox|code generation from strings disallowed|reading ['"]constructor['"]|process is not defined|require is not defined|fetch is not defined/i.test(combined)) {
    return { ok: false, status: "sandbox_violation", error: "model attempted an undeclared capability" };
  }
  const detail = [message, stderr.trim()].filter(Boolean).join(": ");
  return { ok: false, status: "runtime_error", error: redactForLog(detail || "model process failed") };
}

async function runChild(workspace: string, nodePath: string, limits: ModelSandboxLimits): Promise<ChildResult> {
  const profilePath = join(workspace, "model.sb");
  const runnerPath = join(workspace, "runner.mjs");
  const modelPath = join(workspace, "model.js");
  const inputPath = join(workspace, "input.json");
  const args = ["-f", profilePath, nodePath, `--max-old-space-size=${limits.memoryMb}`, runnerPath, modelPath, inputPath, String(limits.timeoutMs)];
  return new Promise((resolveResult) => {
    const child = spawn("/usr/bin/sandbox-exec", args, {
      cwd: workspace,
      detached: true,
      env: {},
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: ChildResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult(result);
    };
    const timer = setTimeout(() => {
      killGroup(child.pid);
      finish({ ok: false, status: "timeout", error: "model exceeded its time limit" });
    }, limits.timeoutMs + 100);
    const collect = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next) > limits.maxOutputBytes) {
        killGroup(child.pid);
        finish({ ok: false, status: "output_limit", error: "model exceeded its output limit" });
      }
      return next.slice(0, limits.maxOutputBytes);
    };
    child.stdout.on("data", (chunk: Buffer) => { stdout = collect(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = collect(stderr, chunk); });
    child.on("error", (error) => finish({ ok: false, status: "runtime_error", error: redactForLog(error.message) }));
    child.on("close", (code, signal) => {
      if (settled) return;
      if (signal === "SIGABRT") {
        finish({ ok: false, status: "memory_limit", error: "model exceeded its memory limit" });
        return;
      }
      let parsed: unknown;
      try { parsed = JSON.parse(stdout); } catch {
        finish(classifyError(`model returned invalid output (exit ${code ?? "none"}, signal ${signal ?? "none"})`, stderr));
        return;
      }
      if (typeof parsed !== "object" || parsed === null) { finish(classifyError("model returned invalid output", stderr)); return; }
      const record = parsed as Record<string, unknown>;
      if (record.ok === true && typeof record.goal === "boolean") {
        finish({ ok: true, predicted: record.predicted, goal: record.goal });
        return;
      }
      const error = typeof record.error === "object" && record.error !== null
        ? String((record.error as Record<string, unknown>).message ?? "model process failed")
        : "model process failed";
      finish(classifyError(error, stderr));
    });
  });
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function executeTaskModel(options: ExecuteOptions): Promise<ModelSandboxResult> {
  const limits = limitsFrom(options.limits);
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const modelHash = createHash("sha256").update(options.source).digest("hex");
  const receipt = (status: ModelSandboxStatus, error?: string): ModelSandboxReceipt => ({
    version: 1,
    modelHash,
    status,
    startedAt,
    durationMs: Date.now() - started,
    network: "denied",
    environment: "empty",
    filesystem: "disposable-workspace-only",
    limits,
    ...(error ? { error: redactForLog(error) } : {}),
  });
  const finalize = async (status: ModelSandboxStatus, error?: string): Promise<ModelSandboxReceipt> => {
    const value = receipt(status, error);
    await options.recordReceipt(value);
    return value;
  };
  if ((options.platform ?? process.platform) !== "darwin") {
    const value = await finalize("sandbox_unavailable", "strict model sandbox unavailable; refused unsandboxed execution");
    return { ok: false, error: value.error!, receipt: value };
  }
  const workspace = await mkdtemp(join(tmpdir(), "vanta-model-"));
  try {
    const nodePath = process.execPath;
    await Promise.all([
      writeFile(join(workspace, "runner.mjs"), RUNNER, "utf8"),
      writeFile(join(workspace, "model.js"), options.source, "utf8"),
      writeFile(join(workspace, "input.json"), JSON.stringify(options.input), "utf8"),
      writeFile(join(workspace, "model.sb"), buildModelSeatbeltProfile(workspace, nodePath), "utf8"),
    ]);
    const first = await runChild(workspace, nodePath, limits);
    if (!first.ok) {
      const value = await finalize(first.status, first.error);
      return { ok: false, error: first.error, receipt: value };
    }
    const second = await runChild(workspace, nodePath, limits);
    if (!second.ok) {
      const value = await finalize(second.status, second.error);
      return { ok: false, error: second.error, receipt: value };
    }
    if (canonical(first) !== canonical(second)) {
      const error = "model produced different outputs for identical inputs";
      const value = await finalize("nondeterministic", error);
      return { ok: false, error, receipt: value };
    }
    return { ok: true, predicted: first.predicted, goal: first.goal, receipt: await finalize("completed") };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
