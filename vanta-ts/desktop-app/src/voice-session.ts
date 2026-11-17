import { api } from "./api.js";
import { releaseVoiceTracks, voiceError, voiceRecorder, voiceTranscribe, VOICE_MAX_BYTES, VOICE_MAX_MS, type VoiceReadiness, type VoiceTranscript } from "./voice-media.js";

export type VoicePhase = "idle" | "checking" | "permission" | "recording" | "transcribing" | "error";
export type VoiceState = { phase: VoicePhase; message: string };
export type VoiceDeps = {
  readiness: (signal: AbortSignal) => Promise<VoiceReadiness>;
  capture: () => Promise<MediaStream>;
  recorder: (stream: MediaStream) => MediaRecorder;
  transcribe: (blob: Blob, signal: AbortSignal) => Promise<VoiceTranscript>;
};
const browserDeps: VoiceDeps = {
  readiness: (signal) => api<VoiceReadiness>("/api/voice", { signal }),
  capture: () => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone capture is unavailable here. Open the Vanta desktop app or type your message.");
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  },
  recorder: voiceRecorder,
  transcribe: voiceTranscribe,
};
type Attempt = { controller: AbortController; stream?: MediaStream; recorder?: MediaRecorder; chunks: Blob[]; bytes: number; timer?: ReturnType<typeof setTimeout>; stopping: boolean };

export class VoiceSession {
  private attempt?: Attempt;
  constructor(private readonly changed: (state: VoiceState) => void,
    private readonly transcript: (text: string) => void, private readonly deps: VoiceDeps = browserDeps) {}

  get busy(): boolean { return Boolean(this.attempt); }

  async start(): Promise<void> {
    if (this.busy) return;
    const attempt: Attempt = { controller: new AbortController(), chunks: [], bytes: 0, stopping: false };
    this.attempt = attempt;
    this.changed({ phase: "checking", message: "Checking local dictation…" });
    try {
      const readiness = await this.deps.readiness(attempt.controller.signal);
      if (!this.current(attempt)) return;
      if (!readiness.ready) throw new Error(readiness.reason || "Local dictation is not ready. Set up local Whisper and its model, then try again. You can still type.");
      this.changed({ phase: "permission", message: "Waiting for microphone permission…" });
      const stream = await this.deps.capture();
      if (!this.current(attempt)) { releaseVoiceTracks(stream); return; }
      attempt.stream = stream;
      this.record(attempt, stream);
    } catch (error) { this.fail(attempt, voiceError(error)); }
  }

  stop(): void {
    const attempt = this.attempt;
    if (!attempt?.recorder || attempt.stopping) return;
    attempt.stopping = true;
    clearTimeout(attempt.timer);
    this.changed({ phase: "transcribing", message: "Transcribing locally… You can keep typing." });
    try { attempt.recorder.stop(); }
    catch (error) { this.fail(attempt, voiceError(error)); }
    finally { releaseVoiceTracks(attempt.stream); }
  }

  cancel(notify = true): void {
    const attempt = this.attempt;
    this.attempt = undefined;
    if (attempt) this.release(attempt);
    if (notify) this.changed({ phase: "idle", message: "Dictation canceled. Your draft is unchanged." });
  }

  private current(attempt: Attempt): boolean { return this.attempt === attempt && !attempt.controller.signal.aborted; }

  private record(attempt: Attempt, stream: MediaStream): void {
    const recorder = this.deps.recorder(stream);
    attempt.recorder = recorder;
    recorder.ondataavailable = (event) => this.chunk(attempt, event.data);
    recorder.onerror = () => this.fail(attempt, "Microphone recording failed. Your draft is unchanged; check the microphone and try again.");
    recorder.onstop = () => {
      if (!attempt.stopping) this.fail(attempt, "Microphone recording stopped unexpectedly. Your draft is unchanged; try again.");
      else void this.finish(attempt);
    };
    recorder.start(250);
    attempt.timer = setTimeout(() => this.stop(), VOICE_MAX_MS);
    this.changed({ phase: "recording", message: "Recording · up to 30 seconds. Stop to add text to your draft." });
  }

  private chunk(attempt: Attempt, chunk: Blob): void {
    if (!this.current(attempt)) return;
    attempt.bytes += chunk.size;
    if (attempt.bytes > VOICE_MAX_BYTES) { this.fail(attempt, "Recording reached the 4 MiB limit. Try a shorter recording; your draft is unchanged."); return; }
    if (chunk.size) attempt.chunks.push(chunk);
  }

  private async finish(attempt: Attempt): Promise<void> {
    if (!this.current(attempt)) return;
    releaseVoiceTracks(attempt.stream);
    try {
      if (!attempt.bytes) throw new Error("No audio was captured. Check your microphone and try again.");
      const blob = new Blob(attempt.chunks, { type: attempt.recorder?.mimeType || "audio/webm" });
      const result = await this.deps.transcribe(blob, attempt.controller.signal);
      if (!this.current(attempt)) return;
      if (typeof result.text !== "string" || !result.text.trim()) throw new Error("No speech was found. Try again or type your message.");
      this.transcript(result.text.trim());
      this.attempt = undefined;
      this.release(attempt);
      this.changed({ phase: "idle", message: "Dictation added to your draft. Review it before sending." });
    } catch (error) { this.fail(attempt, voiceError(error)); }
  }

  private fail(attempt: Attempt, message: string): void {
    if (!this.current(attempt)) return;
    this.attempt = undefined;
    this.release(attempt);
    this.changed({ phase: "error", message });
  }

  private release(attempt: Attempt): void {
    attempt.controller.abort();
    clearTimeout(attempt.timer);
    const recorder = attempt.recorder;
    if (recorder) {
      recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null;
      if (recorder.state !== "inactive") { try { recorder.stop(); } catch { /* Tracks must still close. */ } }
    }
    releaseVoiceTracks(attempt.stream);
    attempt.chunks = [];
  }
}
