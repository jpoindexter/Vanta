import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { fakeIpc } from "./bridge-test-helpers";
import { buildHermesDesktop } from "./bridge-surface";
import { env } from "./bridge-test-helpers";
import { CH } from "./channels";
import { registerContextMenu, type MenuContents } from "./context-menu";
import type { IpcLike } from "./native-handlers";

function setup() {
  const emitter = new EventEmitter();
  const contents = Object.assign(emitter, {
    copy: vi.fn(),
    copyImageAt: vi.fn(),
    cut: vi.fn(),
    id: 4,
    paste: vi.fn(),
    replaceMisspelling: vi.fn(),
    selectAll: vi.fn(),
    send: vi.fn(),
    session: { addWordToSpellCheckerDictionary: vi.fn() }
  });

  const handlers = new Map<string, (event: { sender: unknown }, ...args: unknown[]) => unknown>();
  const ipc = { handle: (c, f) => handlers.set(c, f as never), on: () => undefined } as IpcLike;
  const menu = registerContextMenu(ipc);
  menu.attach(contents as unknown as MenuContents);

  return { call: async (channel: string, ...args: unknown[]) => handlers.get(channel)!({ sender: contents }, ...args), contents };
}

describe("edit verbs", () => {
  it.each(["copy", "cut", "paste", "selectAll"] as const)("runs %s on the asking window", async command => {
    const { call, contents } = setup();

    await call(CH.contextMenuEdit, command);

    expect(contents[command]).toHaveBeenCalledTimes(1);
  });

  it.each(["delete", "undo", "__proto__", "send", 42, null, "selectall"])("ignores %j", async command => {
    const { call, contents } = setup();

    await call(CH.contextMenuEdit, command);

    expect(contents.copy).not.toHaveBeenCalled();
    expect(contents.send).not.toHaveBeenCalled();
  });
});

describe("copy image", () => {
  it("copies the image under the last click, and nothing before any click", async () => {
    const { call, contents } = setup();

    await call(CH.contextMenuCopyImage);
    expect(contents.copyImageAt).not.toHaveBeenCalled();

    contents.emit("context-menu", {}, { x: 12, y: 34 });
    await call(CH.contextMenuCopyImage);
    expect(contents.copyImageAt).toHaveBeenCalledWith(12, 34);
  });
});

describe("spelling", () => {
  it("forwards a misspelling in an editable field with at most ten suggestions", () => {
    const { contents } = setup();

    contents.emit("context-menu", {}, {
      dictionarySuggestions: Array.from({ length: 15 }, (_, i) => `s${i}`),
      isEditable: true,
      misspelledWord: "teh",
      x: 1,
      y: 2
    });

    const [channel, info] = contents.send.mock.calls[0] as [string, { misspelledWord: string; suggestions: string[] }];
    expect(channel).toBe(CH.contextMenuSpellcheckInfo);
    expect(info.misspelledWord).toBe("teh");
    expect(info.suggestions).toHaveLength(10);
  });

  it("says nothing for a non-editable target or a correctly spelled word", () => {
    const { contents } = setup();

    contents.emit("context-menu", {}, { isEditable: false, misspelledWord: "teh", x: 1, y: 2 });
    contents.emit("context-menu", {}, { isEditable: true, x: 1, y: 2 });

    expect(contents.send).not.toHaveBeenCalled();
  });

  it("replaces a word or adds it to the dictionary, and ignores anything else", async () => {
    const { call, contents } = setup();

    await call(CH.contextMenuSpellcheck, { kind: "replace", word: "the" });
    await call(CH.contextMenuSpellcheck, { kind: "add", word: "Vanta" });
    await call(CH.contextMenuSpellcheck, { kind: "delete", word: "x" });
    await call(CH.contextMenuSpellcheck, { kind: "add", word: "" });
    await call(CH.contextMenuSpellcheck, { kind: "add", word: "x".repeat(101) });
    await call(CH.contextMenuSpellcheck, "add");

    expect(contents.replaceMisspelling).toHaveBeenCalledWith("the");
    expect(contents.session.addWordToSpellCheckerDictionary).toHaveBeenCalledTimes(1);
    expect(contents.session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith("Vanta");
  });
});

describe("renderer side", () => {
  it("sends the verbs and delivers spelling info", async () => {
    const { emit, invoked, ipc } = fakeIpc();
    const desktop = buildHermesDesktop(env(ipc)) as Record<string, any>;
    const seen: unknown[] = [];

    await desktop.contextMenuEdit("copy");
    await desktop.contextMenuCopyImage();
    await desktop.contextMenuSpellcheck({ kind: "add", word: "x" });
    desktop.onContextMenuSpellcheck((info: unknown) => seen.push(info));
    emit(CH.contextMenuSpellcheckInfo, { misspelledWord: "teh", suggestions: ["the"] });

    expect(invoked.map(call => call[0])).toEqual([CH.contextMenuEdit, CH.contextMenuCopyImage, CH.contextMenuSpellcheck]);
    expect(seen).toEqual([{ misspelledWord: "teh", suggestions: ["the"] }]);
  });
});
