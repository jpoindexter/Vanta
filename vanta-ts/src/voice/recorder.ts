import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlink } from "node:fs/promises";

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
