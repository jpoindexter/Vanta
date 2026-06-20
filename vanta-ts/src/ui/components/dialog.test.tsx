import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { Text } from "ink";
import { renderUi, tick } from "../test-render.js";
import { Dialog } from "./dialog.js";

describe("Dialog", () => {
  it("shows its title and a bordered body", async () => {
    const inst = renderUi(h(Dialog, { title: "Confirm action" }, h(Text, {}, "Are you sure?")));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("Confirm action");
    expect(frame).toContain("Are you sure?");
    expect(frame).toMatch(/[╭╮╰╯]/); // round border corners
    inst.unmount();
  });

  it("renders the footer hint when provided", async () => {
    const inst = renderUi(
      h(Dialog, { title: "Delete?", footer: "Enter confirm · Esc cancel" }, h(Text, {}, "body")),
    );
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("Enter confirm");
    expect(frame).toContain("Esc cancel");
    inst.unmount();
  });

  it("omits the footer when not provided", async () => {
    const inst = renderUi(h(Dialog, { title: "Plain" }, h(Text, {}, "x")));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("Plain");
    expect(frame).not.toContain("Esc cancel");
    inst.unmount();
  });
});
