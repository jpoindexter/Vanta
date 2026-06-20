import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { record } from "./record-cmd.js";
import {
  stopRecording,
  isRecording,
  recordOutput,
} from "../recording/session-recorder.js";
import type { ReplCtx } from "./types.js";

// The recorder is a module-level singleton; isolate each test on its own
// VANTA_HOME temp dir and always seal any open recording afterward.
function makeCtx(home: string): ReplCtx {
  return {
    env: { VANTA_HOME: home } as NodeJS.ProcessEnv,
    now: () => new Date("2026-06-20T10:00:00.000Z"),
  } as unknown as ReplCtx;
}

afterEach(() => {
  stopRecording();
});

describe("/record", () => {
  it("reports not recording when bare and nothing is active", async () => {
    const home = mkdtempSync(join(tmpdir(), "rec-"));

    const res = await record("", makeCtx(home));

    expect(res.output).toContain("not recording");
    expect(isRecording()).toBe(false);
  });

  it("starts a recording, writing a .cast file under ~/.vanta/recordings", async () => {
    const home = mkdtempSync(join(tmpdir(), "rec-"));

    const res = await record("start", makeCtx(home));

    expect(isRecording()).toBe(true);
    expect(res.output).toMatch(/⏺ recording → .*\.cast/);
    expect(res.output).toContain(join(home, "recordings"));
  });

  it("seals the file on stop, producing a valid asciicast v2 header + event line", async () => {
    const home = mkdtempSync(join(tmpdir(), "rec-"));
    const ctx = makeCtx(home);

    const start = await record("start", ctx);
    const castPath = (start.output ?? "").match(/(\/.*\.cast)/)?.[1] ?? "";
    expect(castPath).not.toBe("");
    recordOutput("hello world\n");

    const stop = await record("stop", ctx);

    expect(isRecording()).toBe(false);
    expect(stop.output).toContain("recording saved");
    const lines = readFileSync(castPath, "utf8").trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const header = JSON.parse(lines[0] ?? "") as { version: number; width: number; height: number };
    expect(header.version).toBe(2);
    expect(typeof header.width).toBe("number");
    const event = JSON.parse(lines[1] ?? "") as [number, string, string];
    expect(event[1]).toBe("o");
    expect(event[2]).toBe("hello world\n");
  });

  it("refuses a second start while already recording", async () => {
    const home = mkdtempSync(join(tmpdir(), "rec-"));
    const ctx = makeCtx(home);
    await record("start", ctx);

    const res = await record("start", ctx);

    expect(res.output).toContain("already recording");
  });

  it("reports not recording when stopping with nothing active", async () => {
    const res = await record("stop", makeCtx(mkdtempSync(join(tmpdir(), "rec-"))));

    expect(res.output).toContain("not recording");
  });

  it("rejects an unknown verb with usage", async () => {
    const res = await record("pause", makeCtx(mkdtempSync(join(tmpdir(), "rec-"))));

    expect(res.output).toContain("usage: /record");
  });
});
