import { execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlink } from "node:fs/promises";

const execAsync = promisify(execFile);

export type RecorderResult = { path: string; cleanup: () => Promise<void> };

/** Try to find a working audio recorder. Returns the tool name or null. */
export async function detectRecorder(): Promise<"sox" | "ffmpeg" | null> {
  for (const tool of ["sox", "ffmpeg"] as const) {
    try {
      await execAsync(tool, ["--version"], { timeout: 2_000 });
      return tool;
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
): Promise<RecorderResult> {
  const recorder = tool ?? await detectRecorder();
  if (!recorder) {
    throw new Error("No audio recorder found. Install sox (brew install sox) or ffmpeg.");
  }
  const path = join(tmpdir(), `vanta-voice-${Date.now()}.wav`);
  if (recorder === "sox") {
    await execAsync("sox", ["-d", "-r", "16000", "-c", "1", path, "trim", "0", String(durationSec)], { timeout: (durationSec + 5) * 1000 });
  } else {
    // ffmpeg: record from default input
    await execAsync("ffmpeg", ["-y", "-f", "avfoundation", "-i", ":0", "-t", String(durationSec), "-ar", "16000", "-ac", "1", path], { timeout: (durationSec + 5) * 1000 });
  }
  return { path, cleanup: () => unlink(path).catch(() => {}) };
}
