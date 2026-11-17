import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import { LocalDictationError, validateDictationAudio } from "./local-dictation-input.js";
import { requireNonSilentDictation } from "./local-dictation-silence.js";
export { LocalDictationError, MAX_DICTATION_BYTES } from "./local-dictation-input.js";

export type LocalDictationStatus = { ready: boolean; provider: "local-whisper"; model: string; reason?: string };
export type LocalDictationInput = { audio: Uint8Array; mimeType: string; signal?: AbortSignal };
export type LocalDictationResult = { text: string; provider: "local-whisper"; model: string };
type Installation = { status: LocalDictationStatus; whisper?: string; ffmpeg?: string; modelPath?: string };
export type LocalDictationDeps = {
  env?: NodeJS.ProcessEnv;
  home?: string;
  tempRoot?: string;
  run?: (command: string, args: string[], options: { signal?: AbortSignal; env: NodeJS.ProcessEnv }) => Promise<void>;
};
const MODELS = new Set(["tiny", "tiny.en", "base", "base.en", "small", "small.en", "medium", "medium.en", "large", "large-v1", "large-v2", "large-v3", "turbo", "large-v3-turbo"]);
let transcribing = false;

async function findExecutable(name: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  const dirs = [...(env.PATH ?? "").split(delimiter), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
  for (const dir of dirs.filter(isAbsolute)) {
    const path = join(dir, name);
    try { await access(path, constants.X_OK); if ((await stat(path)).isFile()) return path; } catch { /* Try next installed location. */ }
  }
  return undefined;
}

async function installation(deps: LocalDictationDeps): Promise<Installation> {
  const env = deps.env ?? process.env;
  const requested = env.VANTA_STT_MODEL?.trim() || "tiny";
  const model = MODELS.has(requested) ? requested : "tiny";
  const status: LocalDictationStatus = { ready: false, provider: "local-whisper", model };
  if (!MODELS.has(requested)) return { status: { ...status, reason: "Choose an installed Whisper model name with VANTA_STT_MODEL; paths and URLs are not accepted." } };
  const [whisper, ffmpeg] = await Promise.all([findExecutable("whisper", env), findExecutable("ffmpeg", env)]);
  if (!whisper || !ffmpeg) return { status: { ...status, reason: "Install local Whisper and ffmpeg to enable offline dictation. Nothing is downloaded automatically." } };
  const modelPath = join(deps.home ?? homedir(), ".cache", "whisper", `${model}.pt`);
  try {
    await access(modelPath, constants.R_OK);
    if (!(await stat(modelPath)).isFile()) throw new Error("not a file");
  } catch { return { status: { ...status, reason: `The ${model} Whisper model is not installed locally. Install it explicitly before dictating.` } }; }
  return { status: { ...status, ready: true }, whisper, ffmpeg, modelPath };
}

export async function getLocalDictationStatus(deps: LocalDictationDeps = {}): Promise<LocalDictationStatus> {
  return (await installation(deps)).status;
}

export function runLocalDictationProcess(command: string, args: string[], options: { signal?: AbortSignal; env: NodeJS.ProcessEnv }): Promise<void> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(transcriptionError(true)); return; }
    const child = spawn(command, args, { env: options.env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let failed = false;
    let bytes = 0;
    const stop = () => {
      failed = true;
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch { /* The process may already have exited. */ }
    };
    const count = (chunk: Buffer) => { bytes += chunk.length; if (bytes > 256 * 1024) stop(); };
    child.stdout.on("data", count);
    child.stderr.on("data", count);
    const timer = setTimeout(stop, 120_000);
    options.signal?.addEventListener("abort", stop, { once: true });
    child.once("error", () => { failed = true; });
    child.once("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", stop);
      if (failed || code !== 0) reject(transcriptionError(options.signal?.aborted));
      else resolve();
    });
    if (options.signal?.aborted) stop();
  });
}

function transcriptionError(cancelled = false): LocalDictationError {
  return new LocalDictationError(cancelled ? "Dictation cancelled." : "Local transcription failed. Try another recording.", cancelled ? 499 : 422);
}

function childEnvironment(deps: LocalDictationDeps, ffmpeg: string): NodeJS.ProcessEnv {
  const env = deps.env ?? process.env;
  return { PATH: `${join(ffmpeg, "..")}:/usr/bin:/bin`, HOME: deps.home ?? homedir(), LANG: env.LANG ?? "en_US.UTF-8", PYTHONUNBUFFERED: "1", OMP_NUM_THREADS: "2" };
}

async function transcribeInDirectory(input: LocalDictationInput, installed: Installation, deps: LocalDictationDeps, dir: string): Promise<LocalDictationResult> {
  const format = validateDictationAudio(input.audio, input.mimeType);
  const source = join(dir, `source.${format.extension}`);
  const normalized = join(dir, "audio.wav");
  const run = deps.run ?? runLocalDictationProcess;
  const options = { signal: input.signal, env: childEnvironment(deps, installed.ffmpeg!) };
  await writeFile(source, input.audio, { mode: 0o600, signal: input.signal });
  await run(installed.ffmpeg!, ["-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe", "-f", format.demuxer, "-i", source, "-t", "61", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", normalized], options);
  await requireNonSilentDictation(normalized, input.signal);
  // The absolute cached checkpoint path prevents Whisper from downloading a named model.
  await run(installed.whisper!, [normalized, "--model", installed.modelPath!, "--device", "cpu", "--fp16", "False", "--output_format", "txt", "--output_dir", dir, "--verbose", "False", "--threads", "2"], options);
  const transcript = join(dir, "audio.txt");
  if ((await stat(transcript)).size > 64 * 1024) throw new LocalDictationError("The transcript is too large. Try a shorter recording.", 413);
  const text = (await readFile(transcript, "utf8")).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "").trim();
  if (!text) throw new LocalDictationError("No speech was detected. Try again.", 422);
  return { text, provider: "local-whisper", model: installed.status.model };
}

export async function transcribeLocalAudio(input: LocalDictationInput, deps: LocalDictationDeps = {}): Promise<LocalDictationResult> {
  validateDictationAudio(input.audio, input.mimeType);
  if (input.signal?.aborted) throw new LocalDictationError("Dictation cancelled.", 499);
  if (transcribing) throw new LocalDictationError("Local dictation is busy. Try again when the current transcription finishes.", 409);
  transcribing = true;
  let dir: string | undefined;
  try {
    const installed = await installation(deps);
    if (!installed.status.ready) throw new LocalDictationError(installed.status.reason!, 503);
    dir = await mkdtemp(join(deps.tempRoot ?? tmpdir(), "vanta-dictation-"));
    return await transcribeInDirectory(input, installed, deps, dir);
  } catch (error) {
    if (error instanceof LocalDictationError) throw error;
    throw transcriptionError(input.signal?.aborted);
  } finally {
    try { if (dir) await rm(dir, { recursive: true, force: true }); }
    catch { throw new LocalDictationError("Local audio cleanup failed. Restart Vanta before recording again.", 500); }
    finally { transcribing = false; }
  }
}
