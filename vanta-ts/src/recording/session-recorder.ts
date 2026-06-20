import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, openSync, writeSync, closeSync } from "node:fs";
import { AsciicastRecorder, type RecorderSink, type RecorderResult } from "./asciicast.js";

// VANTA-ASCIICAST — the session-scoped singleton wiring the pure recorder to a
// real `.cast` file under ~/.vanta/recordings/. The output seam tees through
// `recordOutput`; `/record` and `VANTA_RECORD=1` toggle it. OFF = no-op, so
// non-recording output is byte-identical.

const RECORDINGS_SUBDIR = "recordings";

let active: { recorder: AsciicastRecorder; path: string; fd: number } | null = null;

/** ~/.vanta/recordings (VANTA_HOME overrides the home), created on demand. */
export function recordingsDir(env: NodeJS.ProcessEnv = process.env): string {
  const home = env.VANTA_HOME?.trim() || join(homedir(), ".vanta");
  return join(home, RECORDINGS_SUBDIR);
}

/** Terminal dimensions for the header — real TTY when present, else 80x24. */
function terminalSize(): { width: number; height: number } {
  return { width: process.stdout.columns || 80, height: process.stdout.rows || 24 };
}

/** A line-appending file sink. Returns errors-as-values; never throws. */
function fileSink(fd: number): RecorderSink {
  return {
    write: (line: string): RecorderResult => {
      try {
        writeSync(fd, line + "\n");
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}

/** True while a session recording is open. */
export function isRecording(): boolean {
  return active !== null;
}

/** The path of the in-progress recording, or null when not recording. */
export function recordingPath(): string | null {
  return active?.path ?? null;
}

/**
 * Start recording terminal output to a new `.cast` file. Returns the path or an
 * error value (already-recording, or a filesystem failure). The file name is
 * derived from `now` so it is deterministic under an injected clock in tests.
 */
export function startRecording(
  env: NodeJS.ProcessEnv = process.env,
  now: () => number = () => Date.now(),
): { ok: true; path: string } | { ok: false; error: string } {
  if (active) return { ok: false, error: `already recording → ${active.path}` };
  const dir = recordingsDir(env);
  const stamp = new Date(now()).toISOString().replace(/[:.]/g, "-");
  const path = join(dir, `vanta-${stamp}.cast`);
  let fd: number;
  try {
    mkdirSync(dir, { recursive: true });
    fd = openSync(path, "w");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const { width, height } = terminalSize();
  const recorder = new AsciicastRecorder({ width, height, now });
  const res = recorder.start(fileSink(fd));
  if (!res.ok) {
    closeSync(fd);
    return { ok: false, error: res.error };
  }
  active = { recorder, path, fd };
  return { ok: true, path };
}

/** Tee one chunk of terminal output into the recording. No-op when off. */
export function recordOutput(data: string): void {
  if (!active) return;
  active.recorder.record(data);
}

/** Stop the recording and close the file. Returns the sealed path, or null if
 * nothing was recording. Idempotent. */
export function stopRecording(): string | null {
  if (!active) return null;
  const { recorder, path, fd } = active;
  recorder.stop();
  try {
    closeSync(fd);
  } catch {
    // best-effort — the events are already flushed line-by-line
  }
  active = null;
  return path;
}
