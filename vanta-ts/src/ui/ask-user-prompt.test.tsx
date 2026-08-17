import { createElement as h } from "react";
import { describe, expect, it, vi } from "vitest";
import { AskUserPrompt, optionTone, type PendingQuestion } from "./ask-user-prompt.js";
import { renderUi, tick, waitForFrame, waitUntil } from "./test-render.js";

function pending(over: Partial<PendingQuestion> = {}): PendingQuestion {
  return {
    questions: [{
      header: "Approach",
      question: "Which implementation should Vanta use?",
      options: [
        { label: "Focused", description: "Smallest safe change", preview: "2 files · low risk" },
        { label: "Broad", description: "Refactor the whole path" },
      ],
    }],
    resolve: vi.fn(),
    ...over,
  };
}

describe("AskUserPrompt", () => {
  it("keeps the active option bright while muting inactive text to readable tones", () => {
    // Bone stepped down in tone (the brand ladder), not standalone greys.
    expect(optionTone(true)).toEqual({
      bold: true,
      descriptionColor: "#b3aea3",
    });
    expect(optionTone(false)).toEqual({
      bold: false,
      labelColor: "#b3aea3",
      descriptionColor: "#7d796f",
    });
  });

  it("renders a compact numbered question, preview, Other, and keyboard hints", async () => {
    const inst = renderUi(h(AskUserPrompt, { pending: pending(), onDone: () => {} }));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("Approach 1/1");
    expect(frame).toContain("❯ 1.  Focused — Smallest safe change");
    expect(frame).toContain("3. Other — Type your own answer");
    expect(frame).toContain("Preview");
    expect(frame).toContain("2 files · low risk");
    expect(frame).toContain("↑↓ choose · Enter select · Esc cancel");
    inst.unmount();
  });

  it("returns a single selection to the waiting tool and closes", async () => {
    const p = pending();
    const done = vi.fn();
    const inst = renderUi(h(AskUserPrompt, { pending: p, onDone: done }));
    await tick();
    inst.input("\r");
    await waitUntil(() => vi.mocked(p.resolve).mock.calls.length > 0);
    expect(p.resolve).toHaveBeenCalledWith([{ header: "Approach", selected: ["Focused"] }]);
    expect(done).toHaveBeenCalled();
    inst.unmount();
  });

  it("supports multi-select and advances through multiple questions", async () => {
    const p = pending({
      questions: [
        {
          header: "Checks",
          question: "Which checks?",
          multiSelect: true,
          allowOther: false,
          options: [
            { label: "Tests", description: "Run tests" },
            { label: "Types", description: "Run typecheck" },
          ],
        },
        {
          header: "Scope",
          question: "Which scope?",
          allowOther: false,
          options: [
            { label: "Narrow", description: "Focused files" },
            { label: "Full", description: "Whole suite" },
          ],
        },
      ],
    });
    const inst = renderUi(h(AskUserPrompt, { pending: p, onDone: () => {} }));
    await tick();
    inst.input(" ");
    inst.input("\u001b[B");
    inst.input(" ");
    inst.input("\r");
    await waitForFrame(inst, "Scope 2/2");
    inst.input("\u001b[B");
    inst.input("\r");
    await waitUntil(() => vi.mocked(p.resolve).mock.calls.length > 0);
    expect(p.resolve).toHaveBeenCalledWith([
      { header: "Checks", selected: ["Tests", "Types"] },
      { header: "Scope", selected: ["Full"] },
    ]);
    inst.unmount();
  });

  it("collects an operator-authored Other answer and Esc cancels safely", async () => {
    const p = pending();
    const inst = renderUi(h(AskUserPrompt, { pending: p, onDone: () => {} }));
    await tick();
    inst.input("\u001b[B");
    inst.input("\u001b[B");
    inst.input("\r");
    await waitForFrame(inst, "Type your answer");
    inst.input("Use the existing adapter");
    inst.input("\r");
    await waitUntil(() => vi.mocked(p.resolve).mock.calls.length > 0);
    expect(p.resolve).toHaveBeenCalledWith([{ header: "Approach", selected: ["Use the existing adapter"] }]);
    inst.unmount();

    const cancelled = pending();
    const cancelInst = renderUi(h(AskUserPrompt, { pending: cancelled, onDone: () => {} }));
    await tick();
    cancelInst.input("\u001b");
    await waitUntil(() => vi.mocked(cancelled.resolve).mock.calls.length > 0);
    expect(cancelled.resolve).toHaveBeenCalledWith(null);
    cancelInst.unmount();
  });

  it("returns arrow-key control to the choices after an Other answer advances", async () => {
    const p = pending({
      questions: [
        {
          header: "Access",
          question: "Who can you reach?",
          options: [
            { label: "Customers", description: "Existing customers" },
            { label: "Partners", description: "Existing partners" },
          ],
        },
        {
          header: "Scope",
          question: "Which scope?",
          options: [
            { label: "Narrow", description: "Focused files" },
            { label: "Full", description: "Whole suite" },
          ],
        },
      ],
    });
    const inst = renderUi(h(AskUserPrompt, { pending: p, onDone: () => {} }));
    await tick();
    inst.input("\u001b[B");
    inst.input("\u001b[B");
    inst.input("\r");
    await waitForFrame(inst, "Type your answer");
    inst.input("No direct access");
    inst.input("\r");
    await waitForFrame(inst, "Scope 2/2");
    inst.input("\u001b[B");
    inst.input("\r");
    await waitUntil(() => vi.mocked(p.resolve).mock.calls.length > 0);
    expect(p.resolve).toHaveBeenCalledWith([
      { header: "Access", selected: ["No direct access"] },
      { header: "Scope", selected: ["Full"] },
    ]);
    inst.unmount();
  });
});
