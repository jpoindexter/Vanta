import { afterEach, expect, it, vi } from "vitest";
import { FileGroup } from "./rail.js";
import { restoreContextFocus } from "./chat-first-inspector.js";

afterEach(() => vi.unstubAllGlobals());

it("keeps an attached file in the keyboard order without adding it again", () => {
  const insert = vi.fn();
  const group = FileGroup({ label: "Recent", files: ["brief.md"], selected: ["brief.md"], onInsert: insert });
  const button = group!.props.children[1].props.children[0];
  expect(button.props.disabled).toBeUndefined();
  expect(button.props["aria-disabled"]).toBe(true);
  button.props.onClick();
  expect(insert).not.toHaveBeenCalled();
});

it("keeps unattached files operable", () => {
  const insert = vi.fn();
  const group = FileGroup({ label: "Recent", files: ["brief.md"], selected: [], onInsert: insert });
  group!.props.children[1].props.children[0].props.onClick();
  expect(insert).toHaveBeenCalledExactlyOnceWith("brief.md");
});

it("returns context focus to a connected opener", () => {
  const focus = vi.fn(), fallback = vi.fn();
  vi.stubGlobal("document", { body: {}, querySelector: () => ({ focus: fallback }) });
  restoreContextFocus({ isConnected: true, focus } as unknown as HTMLElement);
  expect(focus).toHaveBeenCalledOnce();
  expect(fallback).not.toHaveBeenCalled();
});

it("uses Toggle context when the palette opener vanished or focus came from the page", () => {
  const focus = vi.fn(), fallback = vi.fn();
  const body = { isConnected: true, focus };
  vi.stubGlobal("document", { body, querySelector: () => ({ focus: fallback }) });
  restoreContextFocus({ isConnected: false, focus } as unknown as HTMLElement);
  restoreContextFocus(body as unknown as HTMLElement);
  expect(fallback).toHaveBeenCalledTimes(2);
  expect(focus).not.toHaveBeenCalled();
});
