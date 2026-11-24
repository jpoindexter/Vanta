import { describe, expect, it, vi } from "vitest";
import { runDictationCommand } from "./voice-cmd.js";
import type { captureDictation } from "../voice/dictation-capture.js";

describe("CLI local voice", () => {
  it("defaults to a non-recording status menu", async () => {
    const log = vi.fn();
    const capture = vi.fn();
    await runDictationCommand([], { log, capture, menu: async () => "local ready" });
    expect(log).toHaveBeenCalledWith("local ready");
    expect(capture).not.toHaveBeenCalled();
  });
  it("prints a local transcript without an agent turn", async () => {
    const log = vi.fn();
    const progress = vi.fn();
    const capture = vi.fn<typeof captureDictation>(async () => "My dictated text");
    await runDictationCommand(["record", "4"], { log, progress, capture });
    expect(log.mock.calls).toEqual([["My dictated text"]]);
    expect(progress.mock.calls[0]?.[0]).toContain("Nothing is sent");
    expect(capture.mock.calls[0]?.[0]).toMatchObject({ seconds: 4 });
  });
  it("rejects an invalid duration before recording", async () => {
    const capture = vi.fn();
    await runDictationCommand(["record", "120"], { capture, log: vi.fn() });
    expect(capture).not.toHaveBeenCalled();
  });
  it("aborts on Ctrl+C and removes the temporary listener", async () => {
    const original = process.listenerCount("SIGINT");
    const log = vi.fn();
    await runDictationCommand(["record"], { log, progress: vi.fn(), capture: async ({ signal }) => {
      process.emit("SIGINT");
      expect(signal?.aborted).toBe(true);
      throw new Error("abort");
    } });
    expect(log).toHaveBeenCalledWith("Dictation cancelled. Nothing sent.");
    expect(process.listenerCount("SIGINT")).toBe(original);
  });
});
