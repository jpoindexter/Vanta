import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";

const execAsync = promisify(execFile);

export type RecorderResult = { path: string; cleanup: () => Promise<void> };

/** Try to find a working audio recorder. Returns the tool name or null. */
export type RecorderProbe = (tool: "sox" | "ffmpeg", args: string[]) => Promise<void>;

const realProbe: RecorderProbe = async (tool, args) => {
  await execAsync(tool, args, { timeout: 2_000 });
};

export async function detectRecorder(probe: RecorderProbe = realProbe): Promise<"sox" | "ffmpeg" | null> {
  const candidates = [
    { tool: "sox", args: ["--version"] },
    { tool: "ffmpeg", args: ["-version"] },
  ] as const;
  for (const candidate of candidates) {
    try {
      await probe(candidate.tool, [...candidate.args]);
      return candidate.tool;
    } catch { /* not found */ }
  }
  return null;
}

/**
 * Record audio for `durationSec` seconds to a temp WAV file.
 * Requires sox or ffmpeg to be installed.
 * Returns the path and a cleanup function.
 */
export async function recordAudio(
  durationSec = 5,
  tool?: "sox" | "ffmpeg",
  signal?: AbortSignal,
): Promise<RecorderResult> {
  if (!Number.isFinite(durationSec) || durationSec < 1 || durationSec > 60) throw new Error("Record between 1 and 60 seconds.");
  signal?.throwIfAborted();
  const recorder = tool ?? await detectRecorder();
  if (!recorder) {
    throw new Error("No audio recorder found. Install sox (brew install sox) or ffmpeg.");
  }
  signal?.throwIfAborted();
  const dir = await mkdtemp(join(tmpdir(), "vanta-voice-"));
  const path = join(dir, "audio.wav");
  const cleanup = () => rm(dir, { recursive: true, force: true });
  try {
    const args = recorder === "sox"
      ? ["-d", "-r", "16000", "-c", "1", "-b", "16", path, "trim", "0", String(durationSec)]
      : ["-nostdin", "-y", "-f", "avfoundation", "-i", ":0", "-t", String(durationSec), "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", path];
    if (recorder === "ffmpeg" && process.platform !== "darwin") throw new Error("Use sox for microphone capture on this platform.");
    await execAsync(recorder, args, { timeout: (durationSec + 5) * 1000, signal, killSignal: "SIGKILL", maxBuffer: 256 * 1024 });
    signal?.throwIfAborted();
    return { path, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
