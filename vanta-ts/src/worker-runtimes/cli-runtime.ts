import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redactSecrets } from "../store/secret-scan.js";
import { DEFAULT_RUN_TIMEOUT_MS, SUMMARY_MAX_CHARS } from "./constants.js";
import { execCli, type ExecOutcome, type SpawnFactory } from "./exec-core.js";
import { changesProduct, snapshotTree } from "./git-changes.js";
import type { LaunchGate } from "./launch-gate.js";
import type { OutputParser, ParsedRun } from "./parser.js";
import { detectCli, runProbe, type DetectSpec, type ProbeFn } from "./probe.js";
import { failedOutput, type ResumeInput, type RunInput, type RunOutput, type RunWorkProduct, type SessionRef, type WorkerRuntime } from "./types.js";

// One implementation of "run an agent CLI for a ticket". A CliSpec says how a
// given CLI is invoked and parsed; this file does the shared work around it:
// redact the prompt, pass the launch gate, snapshot the tree, execute, parse,
// and turn the result into a RunOutput. Nothing here bypasses the gate.

export type BuiltCommand = { args: string[]; stdin?: string };
export type BuildContext = { input: RunInput; prompt: string; scratchDir?: string; sessionId?: string };

export type CliSpec = {
  id: string;
  displayName: string;
  command: string;
  selfApproving: boolean;
  detect: DetectSpec;
  build: (context: BuildContext) => BuiltCommand;
  /** Absent: the CLI cannot resume. */
  buildResume?: (context: BuildContext & { sessionId: string }) => BuiltCommand;
  createParser: () => OutputParser;
  /** The CLI writes side files (final message, usage report) into a private temp dir. */
  usesScratchDir?: boolean;
  /** Read those side files after the run; their values win over what the stream said. */
  collect?: (scratchDir: string) => Promise<Partial<ParsedRun>>;
};

export type CliDeps = {
  gate: LaunchGate;
  env: NodeJS.ProcessEnv;
  /** Test seams. */
  spawnFactory?: SpawnFactory;
  probe?: ProbeFn;
  timeoutMs?: number;
};

function timeoutFor(deps: CliDeps): number {
  const fromEnv = Number(deps.env.VANTA_WORKER_RUN_TIMEOUT_MS);
  return deps.timeoutMs ?? (Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_RUN_TIMEOUT_MS);
}

function definedOnly(values: Partial<ParsedRun>): Partial<ParsedRun> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Partial<ParsedRun>;
}

function failureText(outcome: ExecOutcome, parsed: ParsedRun, spec: CliSpec): string {
  if (outcome.notInstalled) return `${spec.command} is not installed (not on PATH)`;
  const stderr = redactSecrets(outcome.stderr).trim().slice(-300);
  return parsed.errorText ?? (stderr || `${spec.command} exited with code ${outcome.code ?? "unknown"}`);
}

function referenceFor(spec: CliSpec, parsed: ParsedRun, cwd: string): SessionRef | undefined {
  return parsed.sessionId ? { runtimeId: spec.id, sessionId: parsed.sessionId, cwd } : undefined;
}

function buildOutput(spec: CliSpec, input: RunInput, parsed: ParsedRun, products: RunWorkProduct[]): RunOutput {
  const message = parsed.finalMessage ? redactSecrets(parsed.finalMessage) : undefined;
  const report: RunWorkProduct[] = message ? [{ kind: "report", source: "final-message", content: message, files: [] }] : [];
  return {
    status: "completed",
    summary: (message ?? "(the agent finished without a final message)").slice(0, SUMMARY_MAX_CHARS),
    workProducts: [...report, ...products],
    ...(parsed.usage ? { usage: parsed.usage } : {}),
    ...(referenceFor(spec, parsed, input.cwd) ? { sessionRef: referenceFor(spec, parsed, input.cwd) } : {}),
    ...((parsed.model ?? input.ticket.model) ? { model: parsed.model ?? input.ticket.model } : {}),
  };
}

type Prepared = { built: BuiltCommand; scratchDir?: string; cleanup: () => Promise<void> };

async function prepare(spec: CliSpec, input: RunInput, sessionId?: string): Promise<Prepared> {
  const prompt = redactSecrets(input.instruction);
  const scratchDir = spec.usesScratchDir ? await mkdtemp(join(tmpdir(), "vanta-worker-")) : undefined;
  const context = { input, prompt, ...(scratchDir ? { scratchDir } : {}) };
  const built = sessionId && spec.buildResume ? spec.buildResume({ ...context, sessionId }) : spec.build(context);
  return { built, scratchDir, cleanup: async () => { if (scratchDir) await rm(scratchDir, { recursive: true, force: true }); } };
}

async function runSpec(spec: CliSpec, deps: CliDeps, input: RunInput, sessionId?: string): Promise<RunOutput> {
  const decision = await deps.gate.authorize({
    runtimeId: spec.id, displayName: spec.displayName, command: spec.command, cwd: input.cwd, ticketId: input.ticket.id,
    prompt: input.instruction, access: input.access ?? "edit", selfApproving: spec.selfApproving,
  });
  if (!decision.ok) return failedOutput(decision.error, "refused");
  const prepared = await prepare(spec, input, sessionId);
  try {
    const before = await snapshotTree(input.cwd);
    const parser = spec.createParser();
    input.onEvent({ kind: "status", text: `started ${spec.displayName}` });
    const outcome = await execCli({
      inv: { cmd: spec.command, args: prepared.built.args }, stdin: prepared.built.stdin, cwd: input.cwd, env: deps.env, signal: input.signal,
      timeoutMs: timeoutFor(deps), effectGate: decision.effectGate, spawnFactory: deps.spawnFactory,
      onLine: (line) => { for (const event of parser.feed(line)) input.onEvent(event); },
    });
    const parsed = parser.result();
    const extra = prepared.scratchDir && spec.collect ? await spec.collect(prepared.scratchDir).catch(() => ({})) : {};
    return await finish({ spec, input, outcome, parsed: { ...parsed, ...definedOnly(extra) }, before });
  } finally {
    await prepared.cleanup();
  }
}

async function finish(params: { spec: CliSpec; input: RunInput; outcome: ExecOutcome; parsed: ParsedRun; before: Awaited<ReturnType<typeof snapshotTree>> }): Promise<RunOutput> {
  const { spec, input, outcome, parsed, before } = params;
  const code = await changesProduct(input.cwd, before);
  const products = code ? [code] : [];
  if (outcome.aborted) return { ...failedOutput(`${spec.displayName} was stopped (the worker was paused or the run was cancelled)`, "aborted"), workProducts: products, ...(parsed.usage ? { usage: parsed.usage } : {}) };
  if (outcome.gateRefused) return failedOutput(`${spec.displayName} launch was refused by the effect gate`, "refused");
  if (parsed.failed || !outcome.ok) {
    return { ...failedOutput(failureText(outcome, parsed, spec)), workProducts: products, ...(parsed.usage ? { usage: parsed.usage } : {}), ...(referenceFor(spec, parsed, input.cwd) ? { sessionRef: referenceFor(spec, parsed, input.cwd) } : {}) };
  }
  return buildOutput(spec, input, parsed, products);
}

export function createCliRuntime(spec: CliSpec, deps: CliDeps): WorkerRuntime {
  const resume = spec.buildResume
    ? (input: ResumeInput): Promise<RunOutput> => runSpec(spec, deps, input, input.sessionRef.sessionId)
    : undefined;
  return {
    id: spec.id,
    displayName: spec.displayName,
    selfApproving: spec.selfApproving,
    detect: ({ env }) => detectCli(spec.detect, env, deps.probe ?? runProbe),
    run: (input) => runSpec(spec, deps, input),
    ...(resume ? { resume } : {}),
  };
}
