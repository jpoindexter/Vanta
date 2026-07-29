import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { beginTtftTurn, recordTtftStage, type TtftTraceEvent } from "./ttft-trace.js";

const roots: string[] = [];
const originalTrace = process.env.VANTA_TTFT_TRACE;
const originalSurface = process.env.VANTA_TTFT_SURFACE;

afterEach(() => {
  if (originalTrace === undefined) delete process.env.VANTA_TTFT_TRACE;
  else process.env.VANTA_TTFT_TRACE = originalTrace;
  if (originalSurface === undefined) delete process.env.VANTA_TTFT_SURFACE;
  else process.env.VANTA_TTFT_SURFACE = originalSurface;
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe("TTFT trace", () => {
  it("records versioned content-free stage timestamps and deduplicates a stage", () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-ttft-trace-"));
    roots.push(root);
    const path = join(root, "trace.jsonl");
    process.env.VANTA_TTFT_TRACE = path;
    process.env.VANTA_TTFT_SURFACE = "tui";

    const turn = beginTtftTurn("agent");
    recordTtftStage("provider_dispatch", turn);
    recordTtftStage("provider_first_delta", turn);
    recordTtftStage("provider_first_delta", turn);

    const events = readFileSync(path, "utf8").trim().split("\n").map((line) => JSON.parse(line) as TtftTraceEvent);
    expect(events.map((event) => event.stage)).toEqual(["turn_started", "provider_dispatch", "provider_first_delta"]);
    expect(events.every((event) => event.version === 1 && event.surface === "tui" && event.turnId === turn.turnId)).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/prompt|content|secret|api[_-]?key/i);
  });

  it("is a no-op when tracing is disabled", () => {
    delete process.env.VANTA_TTFT_TRACE;
    expect(() => recordTtftStage("provider_dispatch", beginTtftTurn("cli"))).not.toThrow();
  });
});
