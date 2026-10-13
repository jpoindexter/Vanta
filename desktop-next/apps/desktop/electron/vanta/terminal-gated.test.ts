import { describe, expect, it, vi } from "vitest";

import { CH } from "./channels";
import type { IpcLike } from "./native-handlers";
import { type CommandOutcome, MAX_QUEUED_COMMANDS, MAX_TERMINALS_PER_WINDOW, registerGatedTerminals, SHELL_LABEL, type Sink } from "./terminal-gated";

function makeSink(id = 1) {
  const sent: unknown[][] = [];
  const sink: Sink = { id, isDestroyed: () => false, once: vi.fn(), send: (...args) => void sent.push(args) };

  return { sent, sink, text: () => sent.filter(call => call[0] === CH.terminalData).map(call => String(call[2])).join("") };
}

function setup(options: { client?: string; outcome?: (command: string) => Promise<CommandOutcome> } = {}) {
  const handlers = new Map<string, (event: { sender: unknown }, ...args: unknown[]) => unknown>();
  const ipc = { handle: (c, f) => handlers.set(c, f as never), on: () => undefined } as IpcLike;
  const run = vi.fn(options.outcome ?? (async () => ({ ok: true, output: "done" })));
  const clientFor = vi.fn(() => ("client" in options ? options.client : "chat-1"));
  const registry = registerGatedTerminals({ clientFor, ipc, projectName: () => "proj", projectRoot: () => "/work/proj", run });
  const call = async (sender: Sink, channel: string, ...args: unknown[]) => handlers.get(channel)!({ sender }, ...args);

  return { call, clientFor, registry, run };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe("gated terminal session", () => {
  it("starts with a banner saying every command needs approval, and answers with the project folder", async () => {
    const { call } = setup();
    const { sink, text } = makeSink();

    const started = (await call(sink, CH.terminalStart, { cols: 80, rows: 24 })) as { cwd: string; id: string; shell: string };

    expect(started).toMatchObject({ cwd: "/work/proj", shell: SHELL_LABEL });
    expect(text()).toContain("asks for approval first");
    expect(text()).toContain("proj");
  });

  it("sends a typed line to the server as one command, with the chat that will show the approval card, and prints the result", async () => {
    const { call, run } = setup({ outcome: async () => ({ ok: true, output: "line1\nline2" }) });
    const { sink, text } = makeSink();
    const { id } = (await call(sink, CH.terminalStart)) as { id: string };

    await call(sink, CH.terminalWrite, id, "ls\r");
    await flush();

    expect(run).toHaveBeenCalledWith("ls", "chat-1");
    expect(text()).toContain("waiting for approval");
    expect(text()).toContain("line1\r\nline2\r\n");
  });

  it("runs pasted commands one at a time, never in parallel", async () => {
    let active = 0;
    let overlap = false;
    const { call, run } = setup({
      outcome: async () => {
        active += 1;
        overlap = overlap || active > 1;
        await new Promise(resolve => setTimeout(resolve, 5));
        active -= 1;

        return { ok: true, output: "" };
      }
    });
    const { sink } = makeSink();
    const { id } = (await call(sink, CH.terminalStart)) as { id: string };

    await call(sink, CH.terminalWrite, id, "a\nb\nc\n");
    await new Promise(resolve => setTimeout(resolve, 60));

    expect(run.mock.calls.map(c => c[0])).toEqual(["a", "b", "c"]);
    expect(overlap).toBe(false);
  });

  it("caps the commands that can be queued at once", async () => {
    const { call, run } = setup({ outcome: () => new Promise(() => undefined) });
    const { sink } = makeSink();
    const { id } = (await call(sink, CH.terminalStart)) as { id: string };

    await call(sink, CH.terminalWrite, id, Array.from({ length: 50 }, (_, i) => `c${i}\n`).join(""));
    await flush();

    // one is running, the rest wait, and nothing beyond the cap is accepted
    expect(run).toHaveBeenCalledTimes(1);
    await call(sink, CH.terminalWrite, id, "late\n");
    expect(MAX_QUEUED_COMMANDS).toBe(20);
  });

  it("prints a blocked or denied command's reason in red and offers a new prompt", async () => {
    const { call } = setup({ outcome: async () => ({ ok: false, output: "denied by user: irreversible action" }) });
    const { sink, text } = makeSink();
    const { id } = (await call(sink, CH.terminalStart)) as { id: string };

    await call(sink, CH.terminalWrite, id, "git push\r");
    await flush();

    expect(text()).toContain("\u001b[31mdenied by user: irreversible action\u001b[0m");
    expect(text().endsWith("$ ")).toBe(true);
  });

  it("does not run a command when no chat is open to show the approval card", async () => {
    const { call, run } = setup({ client: undefined });
    const { sink, text } = makeSink();
    const { id } = (await call(sink, CH.terminalStart)) as { id: string };

    await call(sink, CH.terminalWrite, id, "ls\r");
    await flush();

    expect(run).not.toHaveBeenCalled();
    expect(text()).toContain("Open a chat first");
  });

  it("answers a server failure as text instead of throwing", async () => {
    const { call } = setup({ outcome: async () => Promise.reject(new Error("The Vanta server is not running.")) });
    const { sink, text } = makeSink();
    const { id } = (await call(sink, CH.terminalStart)) as { id: string };

    await call(sink, CH.terminalWrite, id, "ls\r");
    await flush();

    expect(text()).toContain("The Vanta server is not running.");
  });

  it("handles clear, cd and exit locally without asking the server", async () => {
    const { call, run } = setup();
    const { sent, sink, text } = makeSink();
    const { id } = (await call(sink, CH.terminalStart)) as { id: string };

    await call(sink, CH.terminalWrite, id, "clear\rcd /etc\r");
    await flush();
    expect(text()).toContain("\u001b[2J");
    expect(text()).toContain("cd does nothing here");

    await call(sink, CH.terminalWrite, id, "exit\r");
    await flush();

    expect(run).not.toHaveBeenCalled();
    expect(sent.some(call => call[0] === CH.terminalExit && call[1] === id)).toBe(true);
    expect(await call(sink, CH.terminalWrite, id, "ls\r")).toBe(false);
  });

  it("strips escape sequences out of what a command printed", async () => {
    const { call } = setup({ outcome: async () => ({ ok: true, output: "\u001b]52;c;ZXZpbA==\u0007visible\u001b[2J" }) });
    const { sink, text } = makeSink();
    const { id } = (await call(sink, CH.terminalStart)) as { id: string };

    await call(sink, CH.terminalWrite, id, "x\r");
    await flush();

    expect(text()).toContain("visible");
    expect(text()).not.toContain("ZXZpbA");
  });
});

describe("terminal registry", () => {
  it("lets a window use only its own terminals", async () => {
    const { call, run } = setup();
    const mine = makeSink(1);
    const other = makeSink(2);
    const { id } = (await call(mine.sink, CH.terminalStart)) as { id: string };

    expect(await call(other.sink, CH.terminalWrite, id, "ls\r")).toBe(false);
    expect(await call(other.sink, CH.terminalDispose, id)).toBe(false);
    expect(await call(other.sink, CH.terminalCwd, id)).toBeNull();
    expect(await call(mine.sink, CH.terminalCwd, id)).toBe("/work/proj");
    await flush();
    expect(run).not.toHaveBeenCalled();
  });

  it("caps terminals per window, frees a slot on dispose, and refuses oversized or non-string input", async () => {
    const { call, registry } = setup();
    const { sink } = makeSink();
    const ids: string[] = [];

    for (let index = 0; index < MAX_TERMINALS_PER_WINDOW; index += 1) {
      ids.push(((await call(sink, CH.terminalStart)) as { id: string }).id);
    }

    await expect(call(sink, CH.terminalStart)).rejects.toThrow("Too many terminals");
    expect(await call(sink, CH.terminalDispose, ids[0])).toBe(true);
    expect(registry.count()).toBe(MAX_TERMINALS_PER_WINDOW - 1);
    expect(await call(sink, CH.terminalWrite, ids[1], 42)).toBe(false);
    expect(await call(sink, CH.terminalWrite, ids[1], "x".repeat(100_001))).toBe(false);
    expect(await call(sink, CH.terminalAttach, ids[1])).toBe(true);
    expect(await call(sink, CH.terminalResize, ids[1], { cols: 1, rows: 1 })).toBe(true);
    await call(sink, CH.terminalStart);
  });

  it("closes a window's terminals when the window is destroyed", async () => {
    const { call, registry } = setup();
    const { sink } = makeSink();
    await call(sink, CH.terminalStart);
    await call(sink, CH.terminalStart);

    const destroyed = (sink.once as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as () => void;
    destroyed();

    expect(registry.count()).toBe(0);
  });
});
