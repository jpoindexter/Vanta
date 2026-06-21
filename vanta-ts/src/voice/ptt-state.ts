// VANTA-VOICE-STT — push-to-talk voice input: the PURE slice.
//
// This is the deterministic STATE MACHINE + backend-selection + transcript
// post-processing for a hold-to-talk flow:
//   hold a key → record → release → transcribe → insert transcript into composer.
//
// What is PURE + tested here (this file): the phase transitions, the audio-
// backend pick from availability, the env gate, and the control-strip of the
// transcript. Every function returns a NEW state — input is never mutated.
//
// WIRING — where the live edges plug in (NOT done this round; genuine hardware
// is the documented boundary, mirroring the clarity-gate end-of-turn design):
//   • TUI PTT key (e.g. hold a chord in `ui/composer.tsx`):
//       keydown  → startRecording(state)   (idle/done → recording)
//       keyup    → stopRecording(state)     (recording → transcribing)
//   • Audio backend (`selectAudioBackend({coreaudio,sox,arecord})`): the chosen
//       backend captures mic audio to a buffer/WAV while phase === "recording".
//       Native CoreAudio (cpal) preferred; SoX `rec`/`arecord` are the fallbacks.
//       → LIVE MIC CAPTURE = HARDWARE BOUNDARY, not done here.
//   • STT model: on stopRecording, the captured buffer is sent to a speech-to-
//       text model; its text → completeTranscription(state, text).
//       → STT MODEL CALL = the model/network boundary, not done here.
//   • Composer insert: when phase === "done", state.transcript is inserted into
//       the composer input. SECURITY: a transcript is model/audio OUTPUT, so it
//       is control-stripped here BEFORE it can reach the composer — a malicious
//       audio→STT path could otherwise yield control/escape bytes.
//
// `pttEnabled(env)` (VANTA_VOICE_PTT=1) gates whether the TUI binds the key at
// all. Default OFF.

/** The phases of one push-to-talk capture. */
export type PttPhase = "idle" | "recording" | "transcribing" | "done" | "error";

/** Immutable push-to-talk state. */
export type PttState = {
  readonly phase: PttPhase;
  /** Present only in "done": the control-stripped, trimmed transcript. */
  readonly transcript?: string;
  /** Present only in "error": why the flow failed. */
  readonly error?: string;
};

/** Audio-capture backends, in preference order. */
export type AudioBackend = "coreaudio" | "sox" | "arecord";

/** Which capture backends the host reports as available. */
export type AudioAvailability = {
  readonly coreaudio?: boolean;
  readonly sox?: boolean;
  readonly arecord?: boolean;
};

/** Result of {@link selectAudioBackend}: a backend, or "none" if none available. */
export type AudioBackendChoice = AudioBackend | "none";

const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f]", "g");

/**
 * Strip control/escape bytes from a transcript, then trim. A transcript is
 * model/audio output crossing into the composer, so control bytes are removed
 * before it can reach the UI (matches the repo's control-strip convention).
 */
function sanitizeTranscript(raw: string): string {
  return raw.replace(CONTROL_CHARS, "").trim();
}

/** The clean idle starting state. */
export function resetPtt(): PttState {
  return { phase: "idle" };
}

/**
 * Begin capture. Legal only from "idle" or "done" (start a fresh capture after a
 * completed one). From any other phase the state is returned UNCHANGED (illegal
 * transition is a no-op, not an error — a held key shouldn't poison an in-flight
 * recording/transcription).
 */
export function startRecording(state: PttState): PttState {
  if (state.phase !== "idle" && state.phase !== "done") return state;
  return { phase: "recording" };
}

/**
 * End capture and hand off to the STT model. Legal only from "recording".
 * Otherwise returned UNCHANGED (a key release with no active recording is a
 * no-op).
 */
export function stopRecording(state: PttState): PttState {
  if (state.phase !== "recording") return state;
  return { phase: "transcribing" };
}

/**
 * Record the STT result. Legal only from "transcribing". The transcript is
 * control-stripped + trimmed before storage (see {@link sanitizeTranscript}).
 * From any other phase returned UNCHANGED.
 */
export function completeTranscription(state: PttState, transcript: string): PttState {
  if (state.phase !== "transcribing") return state;
  return { phase: "done", transcript: sanitizeTranscript(transcript) };
}

/**
 * Fail the flow from ANY phase. The error message is control-stripped + trimmed
 * (it may carry tool/model output). Always lands in "error".
 */
export function failPtt(state: PttState, error: string): PttState {
  void state; // failure is reachable from every phase by design
  return { phase: "error", error: sanitizeTranscript(error) };
}

/**
 * Pick the audio-capture backend from availability. Preference order:
 * coreaudio (native cpal) > sox > arecord; "none" when nothing is available.
 * Pure — mirrors the aux-task backend-selection pattern in routing/vision.ts.
 */
export function selectAudioBackend(avail: AudioAvailability): AudioBackendChoice {
  if (avail.coreaudio) return "coreaudio";
  if (avail.sox) return "sox";
  if (avail.arecord) return "arecord";
  return "none";
}

/** Whether push-to-talk is enabled. Opt-in via VANTA_VOICE_PTT=1; default OFF. */
export function pttEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.VANTA_VOICE_PTT === "1";
}
