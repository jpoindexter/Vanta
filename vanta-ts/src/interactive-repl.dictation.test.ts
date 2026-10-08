import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { runReplLoop, type ReplDeps } from "./interactive-repl.js";
import { captureDictation } from "./voice/dictation-capture.js";
import { readSkill } from "./skills/store.js";

vi.mock("./voice/dictation-capture.js", async (original) => ({ ...await original<object>(), captureDictation: vi.fn(async () => "Dictated draft") }));
vi.mock("./skills/store.js", () => ({ readSkill: vi.fn(async () => null), listSkills: async () => [], auditSkills: async () => [] }));
vi.mock("./subagent/async-delegate.js", () => ({ drainAsyncReentry: async () => null }));

describe("readline local dictation", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("prefills a draft and sends the edited text only on the following user submission", async () => {
    const answers = ["/voice record 2", "Dictated draft edited", "/exit"];
    const write = vi.fn();
    const runUserTurn = vi.fn<(text: string) => Promise<void>>(async () => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const deps = { rl: { question: async () => answers.shift()!, write, on: vi.fn(), removeListener: vi.fn() }, convo: { messages: [] }, ctx: { state: { sessionId: "one" }, env: {}, setup: {}, dataDir: "/tmp" }, userCommands: [], runUserTurn, repoRoot: "/tmp", setup: {} } as unknown as ReplDeps;
      await runReplLoop(deps);
      expect(captureDictation).toHaveBeenCalledOnce();
      expect(write).toHaveBeenCalledWith("Dictated draft");
      expect(runUserTurn.mock.calls).toEqual([["Dictated draft edited"]]);
    } finally { log.mockRestore(); }
  });
  it("Ctrl+C before async dispatch finishes prevents capture", async () => {
    let finishRead!: () => void;
    let entered!: () => void;
    const pendingRead = new Promise<void>((resolve) => { entered = resolve; });
    vi.mocked(readSkill).mockImplementationOnce(() => new Promise((resolve) => { finishRead = () => resolve(null); entered(); }));
    const answers = ["/voice record", "/exit"];
    const rl = Object.assign(new EventEmitter(), { question: async () => answers.shift()!, write: vi.fn() });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const deps = { rl, convo: { messages: [] }, ctx: { state: { sessionId: "one" }, env: {}, setup: {}, dataDir: "/tmp" }, userCommands: [], runUserTurn: vi.fn(), repoRoot: "/tmp", setup: {} } as unknown as ReplDeps;
      const loop = runReplLoop(deps);
      await pendingRead;
      rl.emit("SIGINT");
      finishRead();
      await loop;
      expect(captureDictation).not.toHaveBeenCalled();
      expect(rl.write).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
