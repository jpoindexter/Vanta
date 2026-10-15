import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatToolsNavigation } from "./chat-first-tools-navigation.js";

let tree: Root;
let host: HTMLElement;
let history: HTMLElement;
let unmounted = false;

beforeEach(() => {
  const { window, document } = parseHTML("<html><body><aside class='chat-sidebar'><div id='root'></div><div class='lc-history-panel'><button>Existing chat</button></div></aside><main><textarea></textarea></main></body></html>");
  for (const [key, value] of Object.entries({ window, document, Element: window.Element,
    HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
  host = document.getElementById("root")!;
  history = document.querySelector(".lc-history-panel")!;
  tree = createRoot(host);
  unmounted = false;
});

afterEach(async () => {
  if (!unmounted) await act(async () => tree.unmount());
  vi.unstubAllGlobals();
});

async function openTools() {
  const navigate = vi.fn();
  await act(async () => tree.render(<ChatToolsNavigation view="work" onNavigate={navigate} />));
  const trigger = host.querySelector<HTMLButtonElement>(".chat-tools-toggle")!;
  await act(async () => trigger.click());
  return { trigger, navigate };
}

describe("tools popover interaction boundary", () => {
  it("makes only covered history inert and restores it with Escape and trigger focus", async () => {
    const { trigger } = await openTools();
    expect(history.hasAttribute("inert")).toBe(true);
    expect(document.querySelector("main")?.hasAttribute("inert")).toBe(false);
    expect(host.hasAttribute("inert")).toBe(false);
    const focus = vi.spyOn(trigger, "focus");
    const escape = new window.Event("keydown", { bubbles: true });
    Object.defineProperty(escape, "key", { value: "Escape" });
    await act(async () => trigger.dispatchEvent(escape));
    expect(history.hasAttribute("inert")).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(focus).toHaveBeenCalledOnce();
  });

  it("dismisses on an outside pointer without navigating or changing a prior inert value", async () => {
    history.setAttribute("inert", "existing-owner");
    const { trigger, navigate } = await openTools();
    await act(async () => history.dispatchEvent(new window.Event("pointerdown", { bubbles: true })));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(history.getAttribute("inert")).toBe("existing-owner");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps menu clicks operable and restores history when the open menu unmounts", async () => {
    const { trigger } = await openTools();
    await act(async () => trigger.dispatchEvent(new window.Event("pointerdown", { bubbles: true })));
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(history.hasAttribute("inert")).toBe(true);
    await act(async () => tree.unmount());
    unmounted = true;
    expect(history.hasAttribute("inert")).toBe(false);
  });

  it("keeps internal keyboard focus open but restores history when focus leaves the menu", async () => {
    const { trigger, navigate } = await openTools();
    const option = host.querySelector<HTMLButtonElement>("nav button")!;
    const internal = new window.Event("focusout", { bubbles: true });
    Object.defineProperty(internal, "relatedTarget", { value: option });
    await act(async () => trigger.dispatchEvent(internal));
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(history.hasAttribute("inert")).toBe(true);
    const outside = new window.Event("focusout", { bubbles: true });
    Object.defineProperty(outside, "relatedTarget", { value: document.querySelector("textarea") });
    await act(async () => option.dispatchEvent(outside));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(history.hasAttribute("inert")).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
