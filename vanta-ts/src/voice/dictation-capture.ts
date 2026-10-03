import { readFile, stat } from "node:fs/promises";
import { recordAudio } from "./recorder.js";
import { getLocalDictationStatus, transcribeLocalAudio, LocalDictationError, MAX_DICTATION_BYTES } from "./local-dictation.js";

export type DictationCaptureDeps = {
  status?: typeof getLocalDictationStatus;
  record?: typeof recordAudio;
  transcribe?: typeof transcribeLocalAudio;
};

/** Explicit, bounded capture. Never invokes a conversation or hosted STT. */
export async function captureDictation(options: { seconds: number; signal?: AbortSignal; env?: NodeJS.ProcessEnv; onPhase?: (phase: "checking" | "recording" | "transcribing") => void }, deps: DictationCaptureDeps = {}): Promise<string> {
  options.signal?.throwIfAborted();
  options.onPhase?.("checking");
  const status = await (deps.status ?? getLocalDictationStatus)({ env: options.env });
  if (!status.ready) throw new LocalDictationError(status.reason ?? "Local dictation is not ready.", 503);
  options.signal?.throwIfAborted();
  options.onPhase?.("recording");
  const recording = await (deps.record ?? recordAudio)(options.seconds, undefined, options.signal);
  try {
    options.onPhase?.("transcribing");
    options.signal?.throwIfAborted();
    if ((await stat(recording.path)).size > MAX_DICTATION_BYTES) throw new LocalDictationError("Recording is too large. Try a shorter recording.", 413);
    const audio = await readFile(recording.path, { signal: options.signal });
    const result = await (deps.transcribe ?? transcribeLocalAudio)({ audio, mimeType: "audio/wav", signal: options.signal }, { env: options.env });
    options.signal?.throwIfAborted();
    return result.text;
  } finally { await recording.cleanup(); }
}

export function dictationError(error: unknown, signal?: AbortSignal): string {
  if (signal?.aborted) return "Dictation cancelled. Nothing sent.";
  if (error instanceof LocalDictationError) return error.publicMessage;
  return "Could not record locally. Check microphone permission and sox or ffmpeg; then try again.";
}

export function dictationSeconds(value?: string): number | undefined {
  const seconds = value === undefined ? 5 : Number(value);
  return Number.isFinite(seconds) && seconds >= 1 && seconds <= 60 ? seconds : undefined;
}

export async function dictationMenu(env: NodeJS.ProcessEnv, prefix = "/voice"): Promise<string> {
  const status = await getLocalDictationStatus({ env });
  return [
    `Local dictation · ${status.provider} · model ${status.model} · ${status.ready ? "ready" : "not ready"}`,
    ...(status.reason ? [status.reason] : []),
    `${prefix} record [seconds] — record 1–60 seconds, then review text; never auto-send`,
    `${prefix} status · ${prefix} setup · ${prefix} cancel`,
    "Optional spoken replies: /setup tts in TUI, or vanta setup tts in your shell.",
    "Conversation mode: vanta voice conversation (sends transcripts to the configured agent; separate from local dictation).",
  ].join("\n");
}

export async function dictationSetup(env: NodeJS.ProcessEnv, prefix = "/voice"): Promise<string> {
  return [await dictationMenu(env, prefix),
    "Setup: install Whisper, ffmpeg, and a Whisper checkpoint explicitly; nothing is downloaded here.",
    "Whisper checkpoints: ~/.cache/whisper/<model>.pt. Default: tiny.",
    prefix.startsWith("/") ? `${prefix} model <name> — select an installed model for this session.` : "Select a model for this command: VANTA_STT_MODEL=base vanta voice status (then replace status with record).",
    "Microphone permission: vanta voice mic. Test: record 5 seconds and inspect the text before sending.",
  ].join("\n");
}
