import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { IpcRendererLike } from "./bridge-core";
import { buildHermesDesktop } from "./bridge-surface";
import { env } from "./bridge-test-helpers";
import { registerFsHandlers } from "./fs-handlers";
import { registerGitHandlers } from "./git-handlers";
import { createGitRunner } from "./git-runner";
import type { IpcLike } from "./native-handlers";
import { git, initRepo, makeSandbox, type Sandbox, write } from "./project-test-helpers";

/**
 * The renderer bridge wired straight to the real main-process handlers over a real repository:
 * everything the Files pane and Changes pane call, minus Electron's own IPC transport.
 */
let box: Sandbox;
let desktop: Record<string, any>;

beforeEach(() => {
  box = makeSandbox();
  initRepo(box.root);
  const handlers = new Map<string, (event: { sender: unknown }, ...args: unknown[]) => unknown>();
  const main = { handle: (channel, fn) => handlers.set(channel, fn as never), on: () => undefined } as IpcLike;
  const sender = { isDestroyed: () => false, once: () => undefined, removeListener: () => undefined, send: () => undefined };

  registerFsHandlers({ guard: box.guard, ipc: main });
  registerGitHandlers({ git: createGitRunner(), guard: box.guard, ipc: main });

  const ipc: IpcRendererLike = {
    invoke: (async (channel: string, ...args: unknown[]) => structuredClone(await handlers.get(channel)!({ sender }, ...args))) as never,
    on: () => undefined,
    removeListener: () => undefined,
    send: () => undefined
  };

  desktop = buildHermesDesktop(env(ipc));
});

afterEach(() => box.cleanup());

describe("Files pane over the bridge", () => {
  it("opens the tree, expands a folder, previews a file and finds the repository root", async () => {
    write(path.join(box.root, "src", "main.ts"), "export const x = 1;\n");

    const top = await desktop.readDir(box.root);
    const src = top.entries.find((entry: { name: string }) => entry.name === "src");
    const inside = await desktop.readDir(src.path);

    expect(top.entries.map((entry: { name: string }) => entry.name)).toEqual(["src", "a.txt"]);
    expect(inside.entries).toEqual([{ isDirectory: false, name: "main.ts", path: path.join(box.root, "src", "main.ts") }]);
    expect((await desktop.readFileText(inside.entries[0].path)).text).toBe("export const x = 1;\n");
    expect(await desktop.gitRoot(inside.entries[0].path)).toBe(box.root);
    expect((await desktop.normalizePreviewTarget("src/main.ts", box.root)).previewKind).toBe("text");
  });

  it("refuses what it must refuse over the same bridge", async () => {
    write(path.join(box.root, ".env"), "KEY=secret\n");

    expect(await desktop.readFileText(path.join(box.root, ".env"))).toMatchObject({ error: "denied", ok: false });
    expect(await desktop.readFileText(path.join(box.outside, "secret.txt"))).toMatchObject({ error: "outside-project", ok: false });
    expect((await desktop.readDir(box.outside)).entries).toEqual([]);
    await expect(desktop.watchDirectory(box.outside)).rejects.toThrow();
  });
});

describe("Changes pane over the bridge", () => {
  it("shows status, the changed-file list and a diff, and refuses to stage or commit", async () => {
    write(path.join(box.root, "a.txt"), "one\ntwo\nthree\n");
    const before = git(box.root, "status", "--porcelain");

    const status = await desktop.git.repoStatus(box.root);
    const list = await desktop.git.review.list(box.root, "uncommitted", null);
    const diff = await desktop.git.review.diff(box.root, "a.txt", "uncommitted", null, false);

    expect(status).toMatchObject({ branch: "main", changed: 1 });
    expect(list.files).toEqual([{ added: 1, path: "a.txt", removed: 0, staged: false, status: "M" }]);
    expect(diff).toContain("+three");
    expect(await desktop.git.review.revParse(box.root, "HEAD")).toMatch(/^[0-9a-f]{40}$/);

    await expect(desktop.git.review.stage(box.root, "a.txt")).rejects.toThrow("needs your approval");
    await expect(desktop.git.review.commit(box.root, "msg", false)).rejects.toThrow("needs your approval");
    await expect(desktop.git.review.revert(box.root, "a.txt")).rejects.toThrow("needs your approval");
    expect(git(box.root, "status", "--porcelain")).toBe(before);
  });
});
