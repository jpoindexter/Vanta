import { z } from "zod";

// VANTA-ASCIICAST — record a session's terminal output as an asciicast v2
// `.cast` file (the asciinema format) so sessions can be replayed/shared.
//
// Format (asciinema asciicast v2): the first line is a JSON header object
//   {"version":2,"width":W,"height":H,"timestamp":T}
// followed by one JSONL event per line:
//   [elapsedSeconds, "o", data]   ("o" = output stream)
//
// This module is PURE and injectable: `header`/`event` only format strings;
// `start`/`stop` write through an injected sink, and `now` is injected so
// timing is deterministic in tests (no real TTY, no real clock).

const ASCIICAST_VERSION = 2 as const;
const DEFAULT_WIDTH = 80;
const DEFAULT_HEIGHT = 24;
const OUTPUT_STREAM = "o" as const;

/** A line-oriented write target. The real recorder uses a file appender; tests
 * use an in-memory array. Returns errors-as-values — a sink never throws. */
export type RecorderSink = {
  write: (line: string) => RecorderResult;
};

export type RecorderResult =
  | { ok: true }
  | { ok: false; error: string };

const optionsSchema = z
  .object({
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    /** Wall-clock epoch (ms) the recording started, deterministic in tests. */
    now: z.function().returns(z.number()).optional(),
  })
  .strict();

export type RecorderOptions = z.input<typeof optionsSchema>;

/** Round to microsecond precision (asciinema's convention) and drop a trailing
 * `.0` so whole seconds serialize as integers — matching asciinema output. */
function formatTime(seconds: number): number {
  const rounded = Math.round(seconds * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * A pure asciicast v2 recorder. Construct with terminal dimensions + an
 * injected `now` clock; call `start(sink)` to write the header, `event(data)`
 * to append an output event at the current elapsed time, and `stop()` to seal.
 * Nothing here touches a real TTY or the system clock.
 */
export class AsciicastRecorder {
  private readonly width: number;
  private readonly height: number;
  private readonly now: () => number;
  private sink: RecorderSink | null = null;
  private startedAtMs = 0;

  constructor(options: RecorderOptions = {}) {
    const parsed = optionsSchema.safeParse(options);
    const opts = parsed.success ? parsed.data : {};
    this.width = opts.width ?? DEFAULT_WIDTH;
    this.height = opts.height ?? DEFAULT_HEIGHT;
    this.now = opts.now ?? (() => Date.now());
  }

  /** True between a successful `start` and a `stop`. */
  isRecording(): boolean {
    return this.sink !== null;
  }

  /** The asciicast v2 header line (JSON object), pinned to the start time. */
  header(startedAtMs: number): string {
    return JSON.stringify({
      version: ASCIICAST_VERSION,
      width: this.width,
      height: this.height,
      timestamp: Math.floor(startedAtMs / 1000),
    });
  }

  /** One asciicast v2 event line: `[elapsedSeconds, "o", data]`. */
  event(elapsedSeconds: number, data: string): string {
    return JSON.stringify([formatTime(elapsedSeconds), OUTPUT_STREAM, data]);
  }

  /** Begin recording: stamp the start time and write the header to `sink`. */
  start(sink: RecorderSink): RecorderResult {
    if (this.sink) return { ok: false, error: "already recording" };
    this.startedAtMs = this.now();
    const res = sink.write(this.header(this.startedAtMs));
    if (!res.ok) return res;
    this.sink = sink;
    return { ok: true };
  }

  /** Append one output event at the elapsed time since `start`. No-op (ok)
   * when not recording, so a tee into output is byte-identical when off. */
  record(data: string): RecorderResult {
    if (!this.sink) return { ok: true };
    const elapsedSeconds = (this.now() - this.startedAtMs) / 1000;
    return this.sink.write(this.event(elapsedSeconds, data));
  }

  /** Stop recording. Idempotent — stopping when off is a clean no-op. */
  stop(): RecorderResult {
    this.sink = null;
    return { ok: true };
  }
}
