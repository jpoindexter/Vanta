// VANTA-VOICE-STT — push-to-talk flow: record → transcribe → text.
//
// Ties the pure PTT state machine (ptt-state.ts) to the real mic capture
// (mic-capture.ts) and the real whisper transcribe (whisper-stt.ts). The host
// (the TUI PTT key) calls runPttCapture on key-release; the returned transcript
// is inserted into the composer (the named host wire). The capture/transcribe
// seams are injected so the orchestration is unit-tested AND the full
// record→transcribe→text path is proven with `say`-generated audio (live mic
// input is the one part needing a real microphone + a speaker).

import {
  type PttState,
  resetPtt,
  startRecording,
  stopRecording,
  completeTranscription,
  failPtt,
} from "./ptt-state.js";
import { captureMicAudio, type MicCaptureDeps, type MicCaptureResult } from "./mic-capture.js";
import { transcribeAudio, type TranscribeDeps, type TranscribeResult } from "./whisper-stt.js";

/** Record the mic → a file (or an error). Default = real ffmpeg capture. */
export type PttCaptureFn = () => MicCaptureResult;
/** Transcribe a file → text (or an error). Default = real whisper. */
export type PttTranscribeFn = (path: string) => TranscribeResult;

/** Injected seams for {@link runPttCapture}. */
export type PttFlowDeps = {
  capture?: PttCaptureFn;
  transcribe?: PttTranscribeFn;
  micDeps?: MicCaptureDeps;
  sttDeps?: TranscribeDeps;
};

/** Flow outcome: the transcript + final state, or an error + the state it failed in. */
export type PttFlowResult =
  | { ok: true; transcript: string; state: PttState }
  | { ok: false; error: string; state: PttState };

/**
 * Run one push-to-talk capture: record the mic, transcribe it, return the
 * transcript — advancing the state machine idle→recording→transcribing→
 * done/error. Errors-as-values; never throws. Defaults use the real mic +
 * whisper; the seams are injected for tests and the proven `say`→whisper path.
 */
export function runPttCapture(deps: PttFlowDeps = {}): PttFlowResult {
  const capture = deps.capture ?? ((): MicCaptureResult => captureMicAudio(deps.micDeps));
  const transcribe = deps.transcribe ?? ((p: string): TranscribeResult => transcribeAudio(p, deps.sttDeps));
  let state = startRecording(resetPtt());
  const rec = capture();
  if (!rec.ok) {
    state = failPtt(state, rec.error);
    return { ok: false, error: rec.error, state };
  }
  state = stopRecording(state); // recording → transcribing
  const tr = transcribe(rec.path);
  if (!tr.ok) {
    state = failPtt(state, tr.error);
    return { ok: false, error: tr.error, state };
  }
  state = completeTranscription(state, tr.text); // transcribing → done
  return { ok: true, transcript: state.transcript ?? tr.text, state };
}
