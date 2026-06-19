import { createElement as h } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { ElicitationDialog, elicitationMessage, type ElicitationRequest } from "./elicitation-dialog.js";

describe("elicitationMessage — pure", () => {
  it("pulls the message out of params", () => {
    expect(elicitationMessage({ message: "  pick a branch  " })).toBe("pick a branch");
  });
  it("falls back when there is no message", () => {
    expect(elicitationMessage({})).toContain("requesting input");
    expect(elicitationMessage(null)).toContain("requesting input");
    expect(elicitationMessage("nope")).toContain("requesting input");
  });
});

describe("ElicitationDialog — render + resolve", () => {
  const make = (resolve: ElicitationRequest["resolve"]): ElicitationRequest => ({ server: "fs", message: "Confirm path", resolve });

  it("renders the server, message, and controls", async () => {
    const inst = renderUi(h(ElicitationDialog, { request: make(() => {}), onDone: () => {} }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("fs");
    expect(out).toContain("Confirm path");
    expect(out).toContain("send");
    expect(out).toContain("Esc cancel");
    inst.unmount();
  });

  it("accepts on ⏎ with the typed value under the default field", async () => {
    const resolve = vi.fn();
    const onDone = vi.fn();
    const inst = renderUi(h(ElicitationDialog, { request: make(resolve), onDone }));
    await tick();
    inst.input("hi");
    await tick();
    inst.input("\r");
    await tick();
    expect(resolve).toHaveBeenCalledWith({ action: "accept", content: { value: "hi" } });
    expect(onDone).toHaveBeenCalled();
    inst.unmount();
  });

  it("cancels on Esc", async () => {
    const resolve = vi.fn();
    const onDone = vi.fn();
    const inst = renderUi(h(ElicitationDialog, { request: make(resolve), onDone }));
    await tick();
    inst.input("\x1b"); // Esc — Ink debounces, flush twice
    await tick();
    await tick();
    expect(resolve).toHaveBeenCalledWith({ action: "cancel", content: {} });
    expect(onDone).toHaveBeenCalled();
    inst.unmount();
  });

  it("uses a custom field name when provided", async () => {
    const resolve = vi.fn();
    const inst = renderUi(h(ElicitationDialog, { request: { server: "fs", message: "m", field: "code", resolve }, onDone: () => {} }));
    await tick();
    inst.input("42");
    await tick();
    inst.input("\r");
    await tick();
    expect(resolve).toHaveBeenCalledWith({ action: "accept", content: { code: "42" } });
    inst.unmount();
  });
});
