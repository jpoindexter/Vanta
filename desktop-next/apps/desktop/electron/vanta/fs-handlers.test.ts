import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CH } from "./channels";
import { registerFsHandlers } from "./fs-handlers";
import type { IpcLike } from "./native-handlers";
import { makeSandbox, type Sandbox, write } from "./project-test-helpers";

let box: Sandbox;

afterEach(() => box?.cleanup());

function setup() {
  box = makeSandbox();
  write(path.join(box.root, "src", "a.ts"), "export {};\n");
  write(path.join(box.root, ".env"), "KEY=secret\n");
  const handlers = new Map<string, (event: { sender: unknown }, ...args: unknown[]) => unknown>();
  const ipc = { handle: (channel, fn) => handlers.set(channel, fn as never), on: () => undefined } as IpcLike;
  const sender = { isDestroyed: () => false, once: () => undefined, removeListener: () => undefined, send: () => undefined };
  const watches = registerFsHandlers({ guard: box.guard, ipc });
  const call = (channel: string, ...args: unknown[]) => Promise.resolve(handlers.get(channel)!({ sender }, ...args));

  return { call, handlers, watches };
}

describe("registerFsHandlers", () => {
  it("registers exactly the read-only channels", () => {
    const { handlers } = setup();

    expect([...handlers.keys()].sort()).toEqual(
      [CH.fsGitRoot, CH.fsNormalizePreview, CH.fsReadDataUrl, CH.fsReadDir, CH.fsReadText, CH.fsStopWatch, CH.fsWatchDirectory, CH.fsWatchFile].sort()
    );
  });

  it("lists, reads and describes files inside the project", async () => {
    const { call } = setup();

    expect(((await call(CH.fsReadDir, box.root)) as { entries: unknown[] }).entries).toHaveLength(1);
    expect(await call(CH.fsReadText, path.join(box.root, "src", "a.ts"))).toMatchObject({ text: "export {};\n" });
    expect(String(await call(CH.fsReadDataUrl, path.join(box.root, "src", "a.ts")))).toMatch(/^data:/);
    expect(await call(CH.fsNormalizePreview, "src/a.ts", box.root)).toMatchObject({ previewKind: "text" });
  });

  it("refuses the same calls for a secret file and an outside folder", async () => {
    const { call } = setup();

    expect(await call(CH.fsReadText, path.join(box.root, ".env"))).toMatchObject({ error: "denied", ok: false });
    expect(await call(CH.fsReadDir, box.outside)).toEqual({ entries: [], error: "outside-project" });
    expect(await call(CH.fsGitRoot, box.outside)).toBeNull();
    expect(await call(CH.fsNormalizePreview, path.join(box.outside, "secret.txt"), "")).toBeNull();
  });

  it("rejects a directory watch it refuses, since that contract has no failure shape", async () => {
    const { call, watches } = setup();

    await expect(call(CH.fsWatchDirectory, box.outside)).rejects.toThrow("outside the project");
    const ok = (await call(CH.fsWatchDirectory, box.root)) as { id: string };
    expect(watches.size()).toBe(1);
    expect(await call(CH.fsStopWatch, ok.id)).toBe(true);
    expect(await call(CH.fsStopWatch, 42)).toBe(false);
    watches.closeAll();
  });
});
