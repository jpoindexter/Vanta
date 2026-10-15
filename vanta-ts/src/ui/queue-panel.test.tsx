import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderUi, tick, waitForFrame } from "./test-render.js";
import { QueuePanel, queueRowText, visibleQueue } from "./queue-panel.js";
import { Composer } from "./composer.js";
import { reduce } from "./reducer.js";
import { initialState } from "./types.js";

describe("queue display", () => {
  it("takes only the first line and clips long queued text", () => {
    expect(queueRowText("do the thing\nexpanded file contents")).toBe("do the thing");
    expect(queueRowText("x".repeat(500))).toHaveLength(88);
  });

  it("bounds visible rows and renders the grey edit affordance", async () => {
    expect(visibleQueue(["a", "b", "c", "d"])).toHaveLength(3);
    const instance = renderUi(h(QueuePanel, { queued: ["first thing", "second thing"] }));
    await tick();
    expect(instance.lastFrame()).toContain("first thing");
    expect(instance.lastFrame()).toContain("second thing");
    expect(instance.lastFrame()).toContain("Press ↑ to edit queued messages");
    instance.unmount();
  });

  it("renders nothing when the queue is empty", async () => {
    const instance = renderUi(h(QueuePanel, { queued: [] }));
    await tick();
    expect(instance.lastFrame().trim()).toBe("");
    instance.unmount();
  });

  it("reports overflow instead of growing past the row budget", async () => {
    const instance = renderUi(h(QueuePanel, { queued: ["alpha", "bravo", "charlie", "delta", "echo"] }));
    await tick();
    expect(instance.lastFrame()).toContain("… 2 more queued");
    expect(instance.lastFrame()).not.toContain("delta");
    instance.unmount();
  });

  it("pulls the newest queued message into an empty composer", async () => {
    const onEditQueued = vi.fn(() => "queued text");
    const instance = renderUi(h(Composer, {
      onSubmit: () => {}, placeholder: "Ask", files: [], history: ["earlier message"], focused: true,
      queuedCount: 2, onEditQueued,
    }));
    await tick();
    instance.input("\u001b[A");
    await waitForFrame(instance, "queued text");
    expect(onEditQueued).toHaveBeenCalledWith(1);
    instance.unmount();
  });

  it("keeps history navigation when the composer already has text", async () => {
    const onEditQueued = vi.fn(() => "queued text");
    const instance = renderUi(h(Composer, {
      onSubmit: () => {}, placeholder: "Ask", files: [], history: ["earlier message"], focused: true,
      queuedCount: 2, onEditQueued,
    }));
    await tick();
    instance.input("draft");
    await waitForFrame(instance, "draft");
    instance.input("\u001b[A");
    await waitForFrame(instance, "earlier message");
    expect(onEditQueued).not.toHaveBeenCalled();
    instance.unmount();
  });

  it("removes an edited queue entry without disturbing its siblings", () => {
    const queued = reduce(reduce(reduce(initialState, { t: "enqueue", text: "a" }), { t: "enqueue", text: "b" }), { t: "enqueue", text: "c" });
    expect(reduce(queued, { t: "dequeueAt", index: 1 }).queued).toEqual(["a", "c"]);
  });
  it("is a no-op for an out-of-range index", () => {
    const queued = reduce(initialState, { t: "enqueue", text: "a" });
    expect(reduce(queued, { t: "dequeueAt", index: 5 }).queued).toEqual(["a"]);
  });
  it("does not hijack ↑ when nothing is queued", async () => {
    const onEditQueued = vi.fn(() => "queued text");
    const inst = renderUi(h(Composer, {
      onSubmit: () => {}, placeholder: "Ask", files: [], history: ["earlier message"], focused: true,
      queuedCount: 0, onEditQueued,
    }));
    await tick();
    inst.input("\u001b[A");
    await waitForFrame(inst, "earlier message");
    expect(onEditQueued).not.toHaveBeenCalled();
    inst.unmount();
  });
});
