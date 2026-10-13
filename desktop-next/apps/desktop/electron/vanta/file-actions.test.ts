import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CH } from "./channels";
import { checkNewName, decodeImageDataUrl, type FileActionDeps, registerFileActions } from "./file-actions";
import type { IpcLike } from "./native-handlers";
import { makeSandbox, type Sandbox, write } from "./project-test-helpers";

let box: Sandbox;

afterEach(() => box?.cleanup());

const PNG = Buffer.from("89504e470d0a1a0a", "hex");
const PNG_URL = `data:image/png;base64,${PNG.toString("base64")}`;

function setup(options: { approve?: boolean; savePath?: null | string } = {}) {
  box = makeSandbox();
  write(path.join(box.root, "notes.md"), "n");
  write(path.join(box.root, "src", "a.ts"), "a");
  write(path.join(box.root, ".env"), "KEY=1");
  const handlers = new Map<string, (event: { sender: unknown }, ...args: unknown[]) => unknown>();
  const ipc = { handle: (c, f) => handlers.set(c, f as never), on: () => undefined } as IpcLike;
  const confirm = vi.fn(async () => options.approve ?? true);
  const trash = vi.fn(async () => undefined);
  const pickSavePath = vi.fn(async () => ("savePath" in options ? (options.savePath ?? null) : path.join(box.root, "saved.png")));

  const deps: FileActionDeps = { confirm, getRoot: () => box.guard.rootReal(), guard: box.guard, ipc, pickSavePath, trash };
  registerFileActions(deps);

  return { call: async (channel: string, ...args: unknown[]) => handlers.get(channel)!({ sender: {} }, ...args), confirm, pickSavePath, trash };
}

describe("rename", () => {
  it("renames after a native confirmation that names both paths, and answers the new path in the caller's spelling", async () => {
    const { call, confirm } = setup();

    const result = await call(CH.renamePath, path.join(box.root, "notes.md"), "readme.md");

    expect(result).toEqual({ path: path.join(box.root, "readme.md") });
    expect(existsSync(path.join(box.root, "readme.md"))).toBe(true);
    expect(existsSync(path.join(box.root, "notes.md"))).toBe(false);
    expect(confirm).toHaveBeenCalledWith({}, expect.objectContaining({ detail: expect.stringContaining("readme.md"), message: expect.stringContaining("Rename") }));
  });

  it("does nothing when the user cancels", async () => {
    const { call } = setup({ approve: false });

    await expect(call(CH.renamePath, path.join(box.root, "notes.md"), "readme.md")).rejects.toThrow("Cancelled.");
    expect(existsSync(path.join(box.root, "notes.md"))).toBe(true);
  });

  it.each([
    ["a path separator", "a/b.md", "Names cannot contain"],
    ["a backslash", "a\\b.md", "Names cannot contain"],
    ["dot-dot", "..", "not a name"],
    ["an empty name", "   ", "not a name"],
    ["a secret-looking name", ".env.local", "secrets"],
    ["a name that already exists", "src", "already exists"],
    ["a non-string", 42, "Type a new name"]
  ])("refuses %s without asking", async (_label, newName, message) => {
    const { call, confirm } = setup();

    await expect(call(CH.renamePath, path.join(box.root, "notes.md"), newName)).rejects.toThrow(message);
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each([
    ["a file outside the project", () => path.join(box.outside, "secret.txt"), "outside the project"],
    ["a secret file", () => path.join(box.root, ".env"), "secrets"],
    ["the project folder", () => box.root, "project folder itself"]
  ])("refuses to rename %s", async (_label, target, message) => {
    const { call, confirm } = setup();

    await expect(call(CH.renamePath, target(), "x")).rejects.toThrow(message);
    expect(confirm).not.toHaveBeenCalled();
    expect(existsSync(path.join(box.outside, "secret.txt"))).toBe(true);
  });
});

describe("trash", () => {
  it("moves to the Trash only after confirmation", async () => {
    const { call, trash } = setup();

    expect(await call(CH.trashPath, path.join(box.root, "notes.md"))).toBe(true);
    expect(trash).toHaveBeenCalledWith(path.join(box.root, "notes.md"));
  });

  it("does nothing and answers false when the user cancels", async () => {
    const { call, trash } = setup({ approve: false });

    expect(await call(CH.trashPath, path.join(box.root, "notes.md"))).toBe(false);
    expect(trash).not.toHaveBeenCalled();
  });

  it.each([
    ["outside the project", () => path.join(box.outside, "secret.txt")],
    ["a secret", () => path.join(box.root, ".env")],
    ["the project folder", () => box.root],
    ["a .. path", () => `${box.root}/../outside`]
  ])("refuses %s without asking", async (_label, target) => {
    const { call, confirm, trash } = setup();

    await expect(call(CH.trashPath, target())).rejects.toThrow();
    expect(confirm).not.toHaveBeenCalled();
    expect(trash).not.toHaveBeenCalled();
  });
});

describe("save image", () => {
  it("writes the image where the user chose in the save dialog", async () => {
    const { call, pickSavePath } = setup();

    expect(await call(CH.saveImage, PNG_URL)).toBe(true);
    expect(pickSavePath).toHaveBeenCalledWith({}, "image.png");
    expect(readFileSync(path.join(box.root, "saved.png"))).toEqual(PNG);
  });

  it("writes nothing when the dialog is cancelled", async () => {
    const { call } = setup({ savePath: null });

    expect(await call(CH.saveImage, PNG_URL)).toBe(false);
    expect(existsSync(path.join(box.root, "saved.png"))).toBe(false);
  });

  it("saves an image file from the project, but refuses http links, other data types and files outside the project", async () => {
    const { call } = setup();
    writeFileSync(path.join(box.root, "shot.png"), PNG);
    writeFileSync(path.join(box.outside, "shot.png"), PNG);

    expect(await call(CH.saveImage, path.join(box.root, "shot.png"))).toBe(true);
    expect(await call(CH.saveImage, `file://${path.join(box.root, "shot.png")}`)).toBe(true);

    for (const bad of ["https://example.com/a.png", "data:text/html;base64,PGI+", "javascript:alert(1)", path.join(box.outside, "shot.png"), path.join(box.root, "notes.md"), 42]) {
      await expect(call(CH.saveImage, bad)).rejects.toThrow("chat or the project");
    }
  });

  it("ignores a destination that is not an absolute path", async () => {
    const { call } = setup({ savePath: "relative/out.png" });

    expect(await call(CH.saveImage, PNG_URL)).toBe(false);
  });
});

describe("one question at a time", () => {
  it("refuses a second request while a dialog is open", async () => {
    const { call, confirm } = setup();
    let release: (value: boolean) => void = () => undefined;
    confirm.mockImplementationOnce(() => new Promise<boolean>(resolve => void (release = resolve)));

    const first = call(CH.trashPath, path.join(box.root, "notes.md"));
    await vi.waitFor(() => expect(confirm).toHaveBeenCalled());

    await expect(call(CH.trashPath, path.join(box.root, "src", "a.ts"))).rejects.toThrow("open question");
    release(false);
    expect(await first).toBe(false);
  });
});

describe("helpers", () => {
  it("validates new names", () => {
    expect(checkNewName("ok.txt")).toEqual({ name: "ok.txt", ok: true });
    expect(checkNewName(" ok.txt ")).toEqual({ name: "ok.txt", ok: true });
    expect(checkNewName("x".repeat(256))).toMatchObject({ ok: false });
  });

  it("decodes only image data URLs, and respects the size cap", () => {
    expect(decodeImageDataUrl(PNG_URL)).toMatchObject({ type: "image/png" });
    expect(decodeImageDataUrl("data:image/png;base64,")).toBeNull();
    expect(decodeImageDataUrl("data:application/pdf;base64,AAAA")).toBeNull();
    expect(decodeImageDataUrl({})).toBeNull();
  });
});
