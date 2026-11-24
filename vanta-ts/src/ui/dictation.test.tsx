import { useRef, type ReactElement } from "react";
import { Box } from "ink";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Composer } from "./composer.js";
import { DictationDraftContext, DictationIndicator } from "./dictation-context.js";
import { useSlash } from "./use-slash.js";
import { useGlobalKeys } from "./app-keys.js";
import { renderUi, waitForFrame, waitUntil } from "./test-render.js";
import type { Conversation } from "../agent.js";
import type { ReplState } from "../repl/types.js";
import type { RunSetup } from "../session.js";
import { captureDictation } from "../voice/dictation-capture.js";
import { readSkill } from "../skills/store.js";

vi.mock("../voice/dictation-capture.js", async (original) => ({ ...await original<object>(), captureDictation: vi.fn() }));
vi.mock("../skills/store.js", () => ({ readSkill: vi.fn(async () => null), listSkills: async () => [], auditSkills: async () => [] }));
vi.mock("./shortcut-display.js", () => ({ useShortcut: () => () => "Ctrl+R" }));

const send = vi.fn();
const notes = vi.fn();
const exit = vi.fn();
let pendingSlash: Promise<void> | undefined;

function Harness(): ReactElement {
  const convoRef = useRef({ messages: [], send } as unknown as Conversation);
  const replStateRef = useRef({} as ReplState);
  const voice = useSlash({ convoRef, replStateRef, setup: {} as RunSetup, repoRoot: "/tmp", dispatch: notes, send, exit, setComposerAnchor: () => {}, setVim: () => {}, requestSetup: () => {} });
  useGlobalKeys({ busy: false, pending: null, overlayOpen: false, abort: vi.fn(), exit, cycle: () => {}, focus: "composer", focusTargets: [], setFocus: () => {}, quickOpenOpen: false, openQuickOpen: () => {}, globalSearchOpen: false, openGlobalSearch: () => {}, messageActionsOpen: false, openMessageActions: () => {}, backgroundResponseAvailable: false, toggleBackgroundResponse: () => {}, voiceActive: voice.voicePhase !== "idle", toggleDictation: () => { pendingSlash = voice.runSlash(voice.voicePhase === "idle" ? "/voice record" : "/voice cancel"); }, cancelDictation: () => { void voice.runSlash("/voice cancel"); } });
  return <DictationDraftContext.Provider value={{ draft: voice.composerDraft, consumed: voice.consumeDraft }}><Box flexDirection="column"><DictationIndicator phase={voice.voicePhase} /><Composer files={[]} history={[]} placeholder="Draft here" onSubmit={(text) => { if (text.startsWith("/")) void voice.runSlash(text); else send(text); }} /></Box></DictationDraftContext.Provider>;
}

describe("TUI local dictation — real Ink input and composer", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("records on Ctrl+R, displays phases, appends editable text, and waits for Enter", async () => {
    let finish!: (text: string) => void;
    let phase!: (value: "transcribing") => void;
    vi.mocked(captureDictation).mockImplementation(async (options) => {
      options.onPhase?.("recording");
      phase = (value) => options.onPhase?.(value);
      return new Promise((resolve) => { finish = resolve; });
    });
    const inst = renderUi(<Harness />);
    try {
      await waitForFrame(inst, "Draft here");
      inst.input("Existing");
      await waitForFrame(inst, "Existing");
      inst.input("\x12");
      await waitForFrame(inst, "Recording locally");
      expect(captureDictation).toHaveBeenCalledOnce();
      phase("transcribing");
      await waitForFrame(inst, "Transcribing locally");
      finish("dictated words");
      await waitForFrame(inst, "Existing dictated words");
      expect(send).not.toHaveBeenCalled();
      inst.input(" edited");
      await waitForFrame(inst, "dictated words edited");
      inst.input("\r");
      await waitUntil(() => send.mock.calls.length === 1);
      expect(send).toHaveBeenCalledWith("Existing dictated words edited");
    } finally { inst.unmount(); }
  });
  it("Escape cancels capture without exiting or losing the typed draft", async () => {
    let finish!: (text: string) => void;
    let signal: AbortSignal | undefined;
    vi.mocked(captureDictation).mockImplementation(async (options) => {
      signal = options.signal;
      options.onPhase?.("recording");
      return new Promise((resolve) => { finish = resolve; });
    });
    const inst = renderUi(<Harness />);
    try {
      await waitForFrame(inst, "Draft here");
      inst.input("Keep me");
      await waitForFrame(inst, "Keep me");
      inst.input("\x12");
      await waitForFrame(inst, "Recording locally");
      inst.input("\x1b");
      await waitUntil(() => signal?.aborted === true);
      finish("discard this");
      await waitUntil(() => notes.mock.calls.some(([action]) => action.text?.includes("cancelled")));
      expect(send).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
      expect(inst.lastFrame()).not.toContain("discard this");
      inst.input("\r");
      await waitUntil(() => send.mock.calls.length === 1);
      expect(send).toHaveBeenCalledWith("Keep me");
    } finally { inst.unmount(); }
  });
  it("unmount during async command dispatch prevents any microphone capture", async () => {
    let finish!: () => void;
    vi.mocked(readSkill).mockImplementationOnce(() => new Promise((resolve) => { finish = () => resolve(null); }));
    const inst = renderUi(<Harness />);
    await waitForFrame(inst, "Draft here");
    inst.input("\x12");
    await waitUntil(() => vi.mocked(readSkill).mock.calls.length === 1);
    inst.unmount();
    finish();
    await pendingSlash;
    expect(captureDictation).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
