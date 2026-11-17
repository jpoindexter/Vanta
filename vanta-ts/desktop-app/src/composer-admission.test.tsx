import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Composer, type ComposerProps } from "./composer.js";

let tree: Root, host: HTMLElement;
beforeEach(() => {
  const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
  for (const [key, value] of Object.entries({ window, document, Element: window.Element,
    HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ready: false }))));
  host = document.getElementById("root")!; tree = createRoot(host);
});
afterEach(async () => { await act(async () => tree.unmount()); vi.unstubAllGlobals(); });

it("preserves a typed follow-up and rejects form submission until the server admits the turn", async () => {
  const props = { value: "Keep this follow-up", busy: true, runReady: false, ready: true, accessMode: "ask", attachments: [],
    onChange: vi.fn(), onSubmit: vi.fn(), onQueue: vi.fn(), onRemoveAttachment: vi.fn(), onLookCapture: vi.fn(),
    onStop: vi.fn(), onAttach: vi.fn(), onMcp: vi.fn(), onModel: vi.fn(), onAccessMode: vi.fn(), onCommand: vi.fn() } as ComposerProps;
  await act(async () => tree.render(<Composer {...props} />));
  expect(host.querySelector(".queue-button")?.hasAttribute("disabled")).toBe(true);
  await act(async () => { host.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
  expect(props.onQueue).not.toHaveBeenCalled();
  expect(host.querySelector("textarea")?.value).toBe("Keep this follow-up");
  await act(async () => tree.render(<Composer {...props} runReady />));
  await act(async () => { host.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
  expect(props.onQueue).toHaveBeenCalledExactlyOnceWith("Keep this follow-up");
});

it("lets the user type before the runtime connects and holds the message instead of sending it", async () => {
  const early = { text: "plan my day", queued: false, onChange: vi.fn(), onQueue: vi.fn() };
  const props = { value: "", busy: false, ready: false, early, accessMode: "ask", attachments: [],
    onChange: vi.fn(), onSubmit: vi.fn(), onQueue: vi.fn(), onRemoveAttachment: vi.fn(), onLookCapture: vi.fn(),
    onStop: vi.fn(), onAttach: vi.fn(), onMcp: vi.fn(), onModel: vi.fn(), onAccessMode: vi.fn(), onCommand: vi.fn() } as ComposerProps;
  await act(async () => tree.render(<Composer {...props} />));
  const input = host.querySelector("textarea")!;
  expect(input.hasAttribute("disabled")).toBe(false);
  expect(input.value).toBe("plan my day");
  expect(host.querySelector(".composer-early-note")?.textContent).toContain("Connecting");
  expect(host.querySelector(".send-button")?.hasAttribute("disabled")).toBe(false);
  await act(async () => { host.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); });
  expect(early.onQueue).toHaveBeenCalledExactlyOnceWith("plan my day");
  expect(props.onSubmit).not.toHaveBeenCalled();
});

it("keeps the composer locked when not ready and no early composer is offered", async () => {
  const props = { value: "", busy: false, ready: false, accessMode: "ask", attachments: [],
    onChange: vi.fn(), onSubmit: vi.fn(), onQueue: vi.fn(), onRemoveAttachment: vi.fn(), onLookCapture: vi.fn(),
    onStop: vi.fn(), onAttach: vi.fn(), onMcp: vi.fn(), onModel: vi.fn(), onAccessMode: vi.fn(), onCommand: vi.fn() } as ComposerProps;
  await act(async () => tree.render(<Composer {...props} />));
  expect(host.querySelector("textarea")?.hasAttribute("disabled")).toBe(true);
  expect(host.querySelector(".composer-early-note")).toBeNull();
});
