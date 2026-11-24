import { captureDictation, dictationError, dictationMenu, dictationSeconds, dictationSetup } from "../voice/dictation-capture.js";
import { getLocalDictationStatus } from "../voice/local-dictation.js";
import type { ReplCtx, ReplState, SlashHandler, SlashResult } from "./types.js";

const active = new WeakMap<ReplState, AbortController>();
export type VoiceCommandDeps = { capture?: typeof captureDictation; menu?: typeof dictationMenu; setup?: typeof dictationSetup };

function cancelVoice(state: ReplState): SlashResult {
  const controller = active.get(state);
  controller?.abort();
  return { output: controller ? "  Cancelling dictation… Nothing sent." : "  No dictation is active." };
}

async function selectModel(value: string | undefined, ctx: ReplCtx): Promise<SlashResult> {
  if (!value) return { output: "  usage: /voice model <installed model name>" };
  const status = await getLocalDictationStatus({ env: { ...ctx.env, VANTA_STT_MODEL: value } });
  if (!status.ready) return { output: `  Model unchanged. ${status.reason}` };
  ctx.state.dictationModel = value;
  return { output: `  Local dictation model: ${value} (this session). No download or recording started.` };
}

function voiceSignal(ctx: ReplCtx, controller: AbortController): AbortSignal {
  return AbortSignal.any([controller.signal, ctx.voiceSignal ?? controller.signal]);
}

async function recordVoice(value: string | undefined, ctx: ReplCtx, deps: VoiceCommandDeps, env: NodeJS.ProcessEnv): Promise<SlashResult> {
  const seconds = dictationSeconds(value);
  if (seconds === undefined) return { output: "  Record between 1 and 60 seconds." };
  if (active.has(ctx.state)) return { output: "  Dictation is already active. /voice cancel to discard it." };
  const controller = new AbortController();
  const signal = voiceSignal(ctx, controller);
  const sessionId = ctx.state.sessionId;
  active.set(ctx.state, controller);
  try {
    signal.throwIfAborted();
    ctx.onVoicePhase?.("checking");
    const text = await (deps.capture ?? captureDictation)({ seconds, signal, env, onPhase: ctx.onVoicePhase });
    if (signal.aborted || ctx.state.sessionId !== sessionId) return { output: "  Dictation cancelled. Nothing sent." };
    return { output: "  Local transcript ready — review and edit the draft, then send when ready. Nothing sent.", loadIntoComposer: text };
  } catch (error) { return { output: `  ${dictationError(error, signal)}` }; }
  finally { active.delete(ctx.state); ctx.onVoicePhase?.("idle"); }
}

/** A slash command prepares a draft only; the host owns the eventual send. */
export function createVoiceCommand(deps: VoiceCommandDeps = {}): SlashHandler {
  return async (arg, ctx) => {
    const env = { ...ctx.env, ...(ctx.state.dictationModel ? { VANTA_STT_MODEL: ctx.state.dictationModel } : {}) };
    const [verb = "status", value, ...extra] = arg.trim().split(/\s+/).filter(Boolean);
    if (verb === "cancel") return cancelVoice(ctx.state);
    if (verb === "setup") return { output: await (deps.setup ?? dictationSetup)(env) };
    if (["status", "help"].includes(verb)) return { output: await (deps.menu ?? dictationMenu)(env) };
    if (extra.length) return { output: "  Too many arguments. /voice help" };
    if (verb === "model") return selectModel(value, ctx);
    if (["record", "test"].includes(verb)) return recordVoice(value, ctx, deps, env);
    return { output: "  usage: /voice [status|setup|model <name>|record [seconds]|test [seconds]|cancel]" };
  };
}

export const voice = createVoiceCommand();
