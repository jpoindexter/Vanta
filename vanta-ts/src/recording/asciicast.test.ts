import { describe, it, expect } from "vitest";
import { AsciicastRecorder, type RecorderSink, type RecorderResult } from "./asciicast.js";

/** An in-memory sink capturing every written line (no real TTY/file). */
function memorySink(): RecorderSink & { lines: string[] } {
  const lines: string[] = [];
  return { lines, write: (line: string): RecorderResult => { lines.push(line); return { ok: true }; } };
}

/** A sink that always fails — to prove errors-as-values propagate. */
function failingSink(error: string): RecorderSink {
  return { write: (): RecorderResult => ({ ok: false, error }) };
}

/** A clock returning the queued values in order, deterministic in tests. */
function fakeClock(...ms: number[]): () => number {
  let i = 0;
  return () => ms[Math.min(i++, ms.length - 1)] ?? 0;
}

describe("AsciicastRecorder.header", () => {
  it("produces an exact asciicast v2 header with width, height, and second-precision timestamp", () => {
    const rec = new AsciicastRecorder({ width: 120, height: 40 });

    const header = rec.header(1_700_000_500_000);

    expect(header).toBe('{"version":2,"width":120,"height":40,"timestamp":1700000500}');
  });

  it("defaults to 80x24 when dimensions are omitted", () => {
    const rec = new AsciicastRecorder();

    const header = JSON.parse(rec.header(0)) as { version: number; width: number; height: number };

    expect(header).toMatchObject({ version: 2, width: 80, height: 24 });
  });
});

describe("AsciicastRecorder.event", () => {
  it("formats an output event line as [time, \"o\", data]", () => {
    const rec = new AsciicastRecorder();

    const line = rec.event(1.5, "hello\n");

    expect(line).toBe('[1.5,"o","hello\\n"]');
  });

  it("serializes a whole-second time as an integer", () => {
    const rec = new AsciicastRecorder();

    expect(rec.event(2, "x")).toBe('[2,"o","x"]');
  });

  it("rounds elapsed time to microsecond precision", () => {
    const rec = new AsciicastRecorder();

    expect(rec.event(0.1234567, "x")).toBe('[0.123457,"o","x"]');
  });
});

describe("AsciicastRecorder.start/record/stop", () => {
  it("writes the header on start then timestamped events relative to the start clock", () => {
    const sink = memorySink();
    const rec = new AsciicastRecorder({ width: 80, height: 24, now: fakeClock(1000, 1500, 2000) });

    expect(rec.start(sink).ok).toBe(true);
    rec.record("first");
    rec.record("second");

    expect(sink.lines).toEqual([
      '{"version":2,"width":80,"height":24,"timestamp":1}',
      '[0.5,"o","first"]',
      '[1,"o","second"]',
    ]);
  });

  it("reports recording state across the lifecycle", () => {
    const rec = new AsciicastRecorder({ now: fakeClock(0) });
    expect(rec.isRecording()).toBe(false);

    rec.start(memorySink());
    expect(rec.isRecording()).toBe(true);

    rec.stop();
    expect(rec.isRecording()).toBe(false);
  });

  it("treats record() as a clean no-op when not recording (off = no output)", () => {
    const rec = new AsciicastRecorder();

    const res = rec.record("ignored");

    expect(res).toEqual({ ok: true });
    expect(rec.isRecording()).toBe(false);
  });

  it("refuses a second start while already recording", () => {
    const rec = new AsciicastRecorder({ now: fakeClock(0) });
    rec.start(memorySink());

    const res = rec.start(memorySink());

    expect(res).toEqual({ ok: false, error: "already recording" });
  });

  it("propagates a sink write failure as an error value on start", () => {
    const rec = new AsciicastRecorder();

    const res = rec.start(failingSink("disk full"));

    expect(res).toEqual({ ok: false, error: "disk full" });
    expect(rec.isRecording()).toBe(false);
  });

  it("propagates a sink write failure as an error value on record", () => {
    const sink: RecorderSink = {
      write: (line) => (line.startsWith("{") ? { ok: true } : { ok: false, error: "write failed" }),
    };
    const rec = new AsciicastRecorder({ now: fakeClock(0, 100) });
    rec.start(sink);

    const res = rec.record("data");

    expect(res).toEqual({ ok: false, error: "write failed" });
  });

  it("is idempotent on stop and allows a fresh recording afterwards", () => {
    const rec = new AsciicastRecorder({ now: fakeClock(0, 0) });
    rec.start(memorySink());
    rec.stop();
    expect(rec.stop()).toEqual({ ok: true });

    const second = memorySink();
    expect(rec.start(second).ok).toBe(true);
    expect(second.lines[0]).toContain('"version":2');
  });
});
