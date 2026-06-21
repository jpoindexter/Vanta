// VANTA-VOICE-STT — mic capture via ffmpeg (the record half).
//
// Records the microphone to a wav file using ffmpeg's macOS avfoundation input
// (sox/arecord are the documented Linux fallbacks). The recorded file is then
// transcribed by voice/whisper-stt.ts. ffmpeg is the injected seam (real by
// default). The LIVE recording itself needs a microphone + a person speaking —
// the one part that cannot be verified headlessly; the arg-building + the
// orchestration are unit-tested, and the capture→transcribe→text path is proven
// end-to-end with `say`-generated audio standing in for the live recording.

import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Runs `ffmpeg <argv>` and returns stdout. The single impure seam. */
export type FfmpegRunner = (argv: readonly string[]) => string;

/** The live ffmpeg binary (cap a touch over the record window). */
export const realFfmpegRunner: FfmpegRunner = (argv) =>
  execFileSync("ffmpeg", argv as string[], { encoding: "utf8", timeout: 60_000 });

/** Whether ffmpeg is present. Never throws. */
export function ffmpegAvailable(run: FfmpegRunner = realFfmpegRunner): boolean {
  try {
    run(["-version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the ffmpeg argv to record `seconds` of mic audio to `outputPath`
 * (mono 16kHz wav — what whisper wants). macOS avfoundation device `:<device>`
 * (default index 0). DISCRETE argv — never a shell string.
 */
export function buildFfmpegMicArgs(outputPath: string, seconds: number, device = "0"): string[] {
  const dur = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 120) : 10;
  return [
    "-f",
    "avfoundation",
    "-i",
    `:${device}`,
    "-t",
    String(dur),
    "-ac",
    "1",
    "-ar",
    "16000",
    "-y",
    outputPath,
  ];
}

/** Injected seams for {@link captureMicAudio}. */
export type MicCaptureDeps = {
  run?: FfmpegRunner;
  seconds?: number;
  device?: string;
  outputPath?: string;
};

/** Capture outcome: the recorded file path, or an error. */
export type MicCaptureResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Record the microphone to a wav file via ffmpeg. Errors-as-values — ffmpeg
 * missing / a record failure → `{ ok:false }`, never throws. The LIVE recording
 * requires a real mic + speech (not headlessly verifiable); the returned path
 * feeds voice/whisper-stt.ts transcribeAudio.
 */
export function captureMicAudio(deps: MicCaptureDeps = {}): MicCaptureResult {
  const run = deps.run ?? realFfmpegRunner;
  if (!ffmpegAvailable(run)) return { ok: false, error: "ffmpeg not installed (brew install ffmpeg)" };
  const path = deps.outputPath ?? join(tmpdir(), `vanta_ptt_${process.pid}.wav`);
  try {
    run(buildFfmpegMicArgs(path, deps.seconds ?? 10, deps.device ?? "0"));
    return { ok: true, path };
  } catch (e) {
    const base = e instanceof Error ? e.message : String(e);
    // a record failure is usually a missing mic permission — point at the fix
    return { ok: false, error: `${base} — grant Microphone access: run \`vanta voice mic\`` };
  }
}
