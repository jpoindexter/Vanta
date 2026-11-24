import { describe, expect, it, vi } from "vitest";
import { createVoiceCommand } from "./voice-cmd.js";
import type { ReplCtx } from "./types.js";
import type { captureDictation } from "../voice/dictation-capture.js";

const ctx = (): ReplCtx => ({ state: {}, env: {} } as ReplCtx);

describe("local /voice", () => {
  it("offers status and setup without capturing or leaving the TUI", async () => {
    const capture = vi.fn();
    const menu = vi.fn(async () => "local-whisper · tiny · not ready");
    const setup = vi.fn(async () => "Local setup; no downloads");
    const command = createVoiceCommand({ capture, menu, setup });
    expect(await command("", ctx())).toEqual({ output: "local-whisper · tiny · not ready" });
    expect(await command("setup", ctx())).toEqual({ output: "Local setup; no downloads" });
    expect(capture).not.toHaveBeenCalled();
  });

  it("returns editable text and never a resend or setup handoff", async () => {
    const capture = vi.fn<typeof captureDictation>(async () => "Review this draft.");
    const result = await createVoiceCommand({ capture })("record 3", ctx());
    expect(result.loadIntoComposer).toBe("Review this draft.");
    expect(result.resend).toBeUndefined();
    expect(result.setupHandoff).toBeUndefined();
    expect(capture.mock.calls[0]?.[0]).toMatchObject({ seconds: 3 });
  });

  it("does not capture invalid durations or unrecognized commands", async () => {
    const capture = vi.fn();
    const command = createVoiceCommand({ capture });
    for (const arg of ["record -1", "record 61", "record nope", "record 2 extra", "conversation"]) {
      expect((await command(arg, ctx())).loadIntoComposer).toBeUndefined();
    }
    expect(capture).not.toHaveBeenCalled();
  });

  it("cancels only this session and discards a late transcript", async () => {
    let resolve!: (text: string) => void;
    const capture = vi.fn(() => new Promise<string>((r) => { resolve = r; }));
    const command = createVoiceCommand({ capture });
    const session = ctx();
    const pending = command("record", session);
    expect((await command("record", session)).output).toContain("already active");
    expect((await command("cancel", ctx())).output).toContain("No dictation");
    expect((await command("cancel", session)).output).toContain("Cancelling");
    resolve("Must not appear");
    const result = await pending;
    expect(result.output).toContain("cancelled");
    expect(result.loadIntoComposer).toBeUndefined();
    expect(result.resend).toBeUndefined();
  });

  it("keeps recording failures out of the draft", async () => {
    const command = createVoiceCommand({ capture: async () => { throw new Error("private recorder detail"); } });
    const result = await command("test", ctx());
    expect(result.output).toContain("Check microphone permission");
    expect(result.output).not.toContain("private recorder detail");
    expect(result.loadIntoComposer).toBeUndefined();
  });
  it("discards a transcript after the session changes", async () => {
    const session = ctx();
    const command = createVoiceCommand({ capture: async () => { session.state.sessionId = "different"; return "stale"; } });
    const result = await command("record", session);
    expect(result.loadIntoComposer).toBeUndefined();
    expect(result.output).toContain("cancelled");
  });
  it("never starts capture after host lifetime ended before dispatch completed", async () => {
    const capture = vi.fn();
    const session = ctx();
    session.voiceSignal = AbortSignal.abort();
    const result = await createVoiceCommand({ capture })("record", session);
    expect(capture).not.toHaveBeenCalled();
    expect(result.output).toContain("cancelled");
  });
});
