import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { dirname } from "node:path";
import { ProgressBar } from "../components/progress-bar.js";
import { RISK, HEALTH } from "../../term/palette.js";
import {
  buildGeneratePrompt,
  parseAgentDefinition,
  agentFileContent,
  agentFilePath,
} from "../../agentgen/generate.js";
import {
  emptyDraft,
  canAdvance,
  blockReason,
  nextStep,
  prevStep,
  isLastStep,
  stepPosition,
  draftToDefinition,
  STEP_COUNT,
  type AgentDraft,
  type StepId,
} from "./steps.js";
import { StepScreen, StepHeader } from "./screens.js";
import {
  isTextStep,
  isListStep,
  applyTextKey,
  moveCursor,
  toggleAtCursor,
  type WizardKey,
} from "./input.js";

// The agent-creation wizard: a guided sequence of step screens with keyboard
// nav (Enter advance / Esc cancel / ↑↓ list cursor / typing for text fields /
// g to generate). The pure step machine lives in steps.ts; the side effects
// (generate, write file) are injected so the component is fully render-tested.

/** Generate the system prompt from a description. Injected for tests. */
export type WizardGenerator = (prompt: string) => Promise<string>;

/** Filesystem seam — injected so tests never touch real files. */
export type WizardFs = {
  mkdir: (dir: string) => Promise<void>;
  writeFile: (path: string, content: string) => Promise<void>;
};

export type WizardDeps = {
  generate: WizardGenerator;
  fs: WizardFs;
  /** Resolve the file path for an identifier. Defaults to the Vanta home. */
  filePath?: (identifier: string) => string;
  /** Called with the written file path on success. */
  onDone?: (path: string) => void;
  /** Called when the operator cancels with Esc. */
  onCancel?: () => void;
  /** Repository context fed to the generator. */
  repoContext?: string;
  /** Disable input (e.g. when a parent owns focus). */
  isActive?: boolean;
};

type Phase = "edit" | "generating" | "writing" | "error";

export function AgentWizard(deps: WizardDeps): ReactElement {
  const [step, setStep] = useState<StepId>("type");
  const [draft, setDraft] = useState<AgentDraft>(emptyDraft);
  const [cursor, setCursor] = useState(0);
  const [phase, setPhase] = useState<Phase>("edit");
  const [error, setError] = useState("");

  const goTo = (next: StepId): void => { setStep(next); setCursor(0); };

  async function advance(): Promise<void> {
    if (!canAdvance(step, draft)) return;
    if (isLastStep(step)) return void write(draft, deps, setPhase, setError);
    goTo(nextStep(step));
  }

  async function generate(): Promise<void> {
    if (step !== "generate" || phase === "generating") return;
    setPhase("generating");
    const prompt = buildGeneratePrompt(draft.description, deps.repoContext ?? "");
    try {
      const out = await deps.generate(prompt);
      const parsed = parseAgentDefinition(out);
      const body = parsed.ok ? parsed.def.systemPrompt : out.trim();
      setDraft((d) => ({ ...d, systemPrompt: body }));
      setPhase("edit");
    } catch (err) {
      setError(`generation failed: ${msg(err)}`);
      setPhase("error");
    }
  }

  useInput(
    (input, key) =>
      routeKey(input, key, { step, cursor, phase, advance, generate, goTo, setDraft, setCursor }, deps),
    { isActive: deps.isActive ?? true },
  );

  return (
    <Box flexDirection="column">
      <StepHeader step={step} position={stepPosition(step)} total={STEP_COUNT} />
      <ProgressBar value={stepPosition(step)} max={STEP_COUNT} width={STEP_COUNT * 2} color={HEALTH} />
      <Box flexDirection="column" marginY={1}>
        <StepScreen step={step} draft={draft} cursor={cursor} />
      </Box>
      <StatusLine step={step} draft={draft} phase={phase} error={error} />
    </Box>
  );
}

type RouteCtx = {
  step: StepId;
  cursor: number;
  phase: Phase;
  advance: () => Promise<void>;
  generate: () => Promise<void>;
  goTo: (s: StepId) => void;
  setDraft: (fn: (d: AgentDraft) => AgentDraft) => void;
  setCursor: (fn: (c: number) => number) => void;
};

/** Route one keypress: nav keys first, then per-mode edit/cursor keys. */
function routeKey(input: string, key: WizardKey, ctx: RouteCtx, deps: WizardDeps): void {
  if (key.escape) return void deps.onCancel?.();
  if (key.return) return void ctx.advance();
  if (ctx.step === "generate" && input === "g") return void ctx.generate();
  if (key.leftArrow && !isTextStep(ctx.step)) return ctx.goTo(prevStep(ctx.step));
  if (isTextStep(ctx.step)) return ctx.setDraft((d) => applyTextKey(ctx.step, d, input, key));
  if (isListStep(ctx.step)) return routeListKey(input, key, ctx);
}

/** Cursor/toggle keys for a list step. */
function routeListKey(input: string, key: WizardKey, ctx: RouteCtx): void {
  if (key.upArrow || key.downArrow) return ctx.setCursor((c) => moveCursor(ctx.step, c, key));
  if (input === " ") return ctx.setDraft((d) => toggleAtCursor(ctx.step, d, ctx.cursor));
}

/** The footer: a generating/writing/error note, else the block reason or a hint. */
function StatusLine(props: { step: StepId; draft: AgentDraft; phase: Phase; error: string }): ReactElement {
  if (props.phase === "generating") return <Text color={HEALTH}>generating…</Text>;
  if (props.phase === "writing") return <Text color={HEALTH}>writing…</Text>;
  if (props.phase === "error") return <Text color={RISK}>{props.error}</Text>;
  const reason = blockReason(props.step, props.draft);
  if (reason) return <Text color={RISK}>{reason}</Text>;
  return <Text dimColor>Enter next · Esc cancel{props.step === "generate" ? " · g generate" : ""}</Text>;
}

/** Generate-or-error message extraction. */
function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Write the agent file from a complete draft. Updates phase/error in place. */
async function write(
  draft: AgentDraft,
  deps: WizardDeps,
  setPhase: (p: Phase) => void,
  setError: (e: string) => void,
): Promise<void> {
  const projected = draftToDefinition(draft);
  if (!projected.ok) {
    setError(projected.error);
    return setPhase("error");
  }
  setPhase("writing");
  const resolvePath = deps.filePath ?? ((id) => agentFilePath(id));
  const path = resolvePath(projected.def.identifier);
  try {
    await deps.fs.mkdir(dirname(path));
    await deps.fs.writeFile(path, agentFileContent(projected.def));
    deps.onDone?.(path);
  } catch (err) {
    setError(`could not write agent file: ${msg(err)}`);
    setPhase("error");
  }
}
