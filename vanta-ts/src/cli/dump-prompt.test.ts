import { describe, expect, it, vi } from "vitest";
import { runDumpPrompt, stripDumpFlag, wantsDumpPrompt, type DumpPromptDeps } from "./dump-prompt.js";

describe("wantsDumpPrompt", () => {
  it("returns true when --dump-system-prompt is present", () => {
    expect(wantsDumpPrompt(["--dump-system-prompt"])).toBe(true);
    expect(wantsDumpPrompt(["chat", "--dump-system-prompt", "--no-tui"])).toBe(true);
  });

  it("returns false when the flag is absent", () => {
    expect(wantsDumpPrompt([])).toBe(false);
    expect(wantsDumpPrompt(["chat", "--no-tui"])).toBe(false);
    expect(wantsDumpPrompt(["--dump-system"])).toBe(false);
  });
});

describe("stripDumpFlag", () => {
  it("removes the flag and preserves the rest", () => {
    expect(stripDumpFlag(["chat", "--dump-system-prompt", "--no-tui"])).toEqual(["chat", "--no-tui"]);
  });

  it("is a no-op when the flag is absent", () => {
    expect(stripDumpFlag(["chat", "--no-tui"])).toEqual(["chat", "--no-tui"]);
  });
});

describe("runDumpPrompt", () => {
  it("calls the injected builder, prints the prompt, and returns 0", async () => {
    const buildPrompt = vi.fn(async () => "ASSEMBLED PROMPT");
    const print = vi.fn();
    const deps: DumpPromptDeps = { buildPrompt, print };

    const code = await runDumpPrompt(deps);

    expect(code).toBe(0);
    expect(buildPrompt).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledWith("ASSEMBLED PROMPT");
  });

  it("returns 1 and prints the error when the builder throws (no throw across the boundary)", async () => {
    const buildPrompt = vi.fn(async () => {
      throw new Error("kernel down");
    });
    const print = vi.fn();

    const code = await runDumpPrompt({ buildPrompt, print });

    expect(code).toBe(1);
    expect(print).toHaveBeenCalledOnce();
    expect(print.mock.calls[0]?.[0]).toContain("kernel down");
  });
});
