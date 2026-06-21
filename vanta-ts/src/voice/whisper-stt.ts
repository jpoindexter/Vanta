// VANTA-VOICE-STT — whisper speech-to-text (the proven audio→text half).
//
// A reusable wrapper over the local `whisper` CLI (verified end-to-end: macOS
// `say` → a real .aiff → `whisper --model tiny` → the transcript). The PTT flow
// (voice/ptt-flow.ts) records the mic to a file, then calls transcribeAudio here.
// The whisper binary is the injected seam (real by default) so the logic is
// unit-testable without running a model; the live transcribe is exercised by a
// skip-if-absent integration test.
//
// SECURITY: the transcript is model output → control-stripped before it can
// reach the composer/model (a crafted audio→STT can't inject control bytes).

import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";

/** Runs `whisper <argv>` and returns stdout. The single impure seam. */
export type WhisperRunner = (argv: readonly string[]) => string;

/** The live whisper binary (2-minute cap; a model run is slow but bounded). */
export const realWhisperRunner: WhisperRunner = (argv) =>
  execFileSync("whisper", argv as string[], { encoding: "utf8", timeout: 120_000 });

/** Whether the `whisper` CLI is present. Never throws. */
export function whisperAvailable(run: WhisperRunner = realWhisperRunner): boolean {
  try {
    run(["--help"]);
    return true;
  } catch {
    return false;
  }
}

/** The STT model from env (`VANTA_STT_MODEL`, default "tiny" — fast + local). */
export function sttModel(env: NodeJS.ProcessEnv = process.env): string {
  const m = env.VANTA_STT_MODEL?.trim();
  return m && m.length > 0 ? m : "tiny";
}

/** Strip C0/C1 + DEL control bytes from untrusted transcript text (keep \n/\t). */
function stripControl(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    const ctrl = (c <= 0x1f && ch !== "\n" && ch !== "\t") || (c >= 0x7f && c <= 0x9f);
    if (!ctrl) out += ch;
  }
  return out;
}

/** Options for {@link buildWhisperArgs}. */
export type WhisperOpts = { model: string; outputDir: string; language?: string };

/** Build the whisper argv (txt output to a dir; English; fp16 off for CPU/MPS). */
export function buildWhisperArgs(audioPath: string, opts: WhisperOpts): string[] {
  return [
    audioPath,
    "--model",
    opts.model,
    "--language",
    opts.language ?? "en",
    "--output_format",
    "txt",
    "--output_dir",
    opts.outputDir,
    "--fp16",
    "False",
  ];
}

/** Injected seams for {@link transcribeAudio}. */
export type TranscribeDeps = {
  run?: WhisperRunner;
  readText?: (path: string) => string;
  outputDir?: string;
  model?: string;
  language?: string;
};

/** Transcription outcome. */
export type TranscribeResult = { ok: true; text: string } | { ok: false; error: string };

/** The `.txt` whisper writes for an input audio file (basename, extension → txt). */
function transcriptPathFor(audioPath: string, outputDir: string): string {
  const base = basename(audioPath).replace(/\.[^.]+$/, "");
  return join(outputDir, `${base}.txt`);
}

/**
 * Transcribe an audio file to text via whisper. Runs the model, reads the
 * produced `.txt`, control-strips it. Errors-as-values — whisper missing / a run
 * failure / no transcript → `{ ok:false }`, never throws. The temp transcript is
 * cleaned up.
 */
export function transcribeAudio(audioPath: string, deps: TranscribeDeps = {}): TranscribeResult {
  const run = deps.run ?? realWhisperRunner;
  const outputDir = deps.outputDir ?? tmpdir();
  const readText = deps.readText ?? ((p) => readFileSync(p, "utf8"));
  if (!whisperAvailable(run)) return { ok: false, error: "whisper not installed (pip install -U openai-whisper)" };
  const txtPath = transcriptPathFor(audioPath, outputDir);
  try {
    run(buildWhisperArgs(audioPath, { model: deps.model ?? "tiny", outputDir, language: deps.language }));
    const text = stripControl(readText(txtPath)).trim();
    return text.length > 0 ? { ok: true, text } : { ok: false, error: "whisper produced no transcript" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    try {
      rmSync(txtPath, { force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}
