import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEarlyComposer, type EarlyComposer } from "./early-composer.js";

let tree: Root;
let latest: EarlyComposer;
const handlers = { send: vi.fn(), keepAsDraft: vi.fn() };

function Probe({ ready }: { ready: boolean }) {
  latest = useEarlyComposer(ready, handlers);
  return null;
}

beforeEach(() => {
  const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
  for (const [key, value] of Object.entries({ window, document, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
  handlers.send.mockClear(); handlers.keepAsDraft.mockClear();
  tree = createRoot(document.getElementById("root")!);
});
afterEach(async () => { await act(async () => tree.unmount()); vi.unstubAllGlobals(); });

const render = (ready: boolean) => act(async () => tree.render(<Probe ready={ready} />));

it("sends a queued message once the runtime is ready", async () => {
  await render(false);
  await act(async () => latest.onQueue("hello"));
  expect(latest.queued).toBe(true);
  await render(true);
  expect(handlers.send).toHaveBeenCalledExactlyOnceWith("hello");
  expect(handlers.keepAsDraft).not.toHaveBeenCalled();
  expect(latest.text).toBe("");
});

it("hands unsent early text to the draft instead of sending it", async () => {
  await render(false);
  await act(async () => latest.onChange("half a thought"));
  await render(true);
  expect(handlers.keepAsDraft).toHaveBeenCalledExactlyOnceWith("half a thought");
  expect(handlers.send).not.toHaveBeenCalled();
});

it("editing after queueing cancels the queued send", async () => {
  await render(false);
  await act(async () => latest.onQueue("hello"));
  await act(async () => latest.onChange("hello there"));
  await render(true);
  expect(handlers.send).not.toHaveBeenCalled();
  expect(handlers.keepAsDraft).toHaveBeenCalledExactlyOnceWith("hello there");
});

it("does nothing when nothing was typed", async () => {
  await render(false);
  await render(true);
  expect(handlers.send).not.toHaveBeenCalled();
  expect(handlers.keepAsDraft).not.toHaveBeenCalled();
});
