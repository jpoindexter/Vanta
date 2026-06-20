import { createElement as h } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderUi, tick, waitForFrame, waitUntil } from "../test-render.js";
import { AgentWizard, type WizardDeps } from "./wizard.js";

/** A capturing fake fs + a stub generator, so no real files and no LLM. */
function fakeDeps(over: Partial<WizardDeps> = {}): {
  deps: WizardDeps;
  writes: { path: string; content: string }[];
} {
  const writes: { path: string; content: string }[] = [];
  const deps: WizardDeps = {
    generate: over.generate ?? vi.fn(async () => "You are a careful researcher."),
    fs: over.fs ?? {
      mkdir: async () => undefined,
      writeFile: async (path, content) => void writes.push({ path, content }),
    },
    filePath: over.filePath ?? ((id) => `/tmp/agents/${id}.md`),
    onDone: over.onDone,
    onCancel: over.onCancel,
  };
  return { deps, writes };
}

describe("AgentWizard — render + keyboard nav", () => {
  it("opens on step 1 (Type) with a progress bar", async () => {
    const { deps } = fakeDeps();
    const inst = renderUi(h(AgentWizard, deps));
    const frame = await waitForFrame(inst, "Step 1/8 — Type");
    expect(frame).toContain("Step 1/8 — Type");
    expect(frame).toContain("["); // ProgressBar track
    expect(frame).toContain("Type:"); // the Type field is shown
    // An empty step surfaces the block reason; the Enter/Esc hint appears once valid.
    inst.input("researcher");
    const filled = await waitForFrame(inst, "Enter next");
    expect(filled).toContain("Enter next");
    inst.unmount();
  });

  it("advances to step 2 (Description) on Enter once Type is filled", async () => {
    const { deps } = fakeDeps();
    const inst = renderUi(h(AgentWizard, deps));
    await waitForFrame(inst, "Step 1/8");
    inst.input("researcher"); // fill the Type field
    await waitForFrame(inst, "researcher");
    inst.input("\r"); // Enter → advance
    const frame = await waitForFrame(inst, "Step 2/8 — Description");
    expect(frame).toContain("Step 2/8 — Description");
    inst.unmount();
  });

  it("refuses to advance from an empty Type step (Enter does nothing)", async () => {
    const { deps } = fakeDeps();
    const inst = renderUi(h(AgentWizard, deps));
    await waitForFrame(inst, "Step 1/8");
    inst.input("\r"); // Enter with no type
    await tick();
    expect(inst.lastFrame()).toContain("Step 1/8 — Type"); // still step 1
    inst.unmount();
  });

  it("reflects position in the progress bar as steps advance", async () => {
    const { deps } = fakeDeps();
    const inst = renderUi(h(AgentWizard, deps));
    await waitForFrame(inst, "Step 1/8");
    const step1Fill = countFilled(inst.lastFrame());
    inst.input("researcher");
    await waitForFrame(inst, "researcher");
    inst.input("\r");
    await waitForFrame(inst, "Step 2/8");
    const step2Fill = countFilled(inst.lastFrame());
    expect(step2Fill).toBeGreaterThan(step1Fill);
    inst.unmount();
  });

  it("cancels on Esc", async () => {
    const onCancel = vi.fn();
    const { deps } = fakeDeps({ onCancel });
    const inst = renderUi(h(AgentWizard, deps));
    await waitForFrame(inst, "Step 1/8");
    inst.input("\x1b"); // Esc
    await waitUntil(() => onCancel.mock.calls.length > 0);
    expect(onCancel).toHaveBeenCalled();
    inst.unmount();
  });

  it("generates the system prompt via the injected generator at the Generate step", async () => {
    const generate = vi.fn(async () => "You are a careful researcher.");
    const { deps } = fakeDeps({ generate });
    const inst = renderUi(h(AgentWizard, deps));
    await drive(inst, [
      ["researcher", "Step 2/8"],
    ]); // through Type
    // Description (≥8 chars)
    inst.input("Researches topics carefully");
    await waitForFrame(inst, "Researches topics");
    inst.input("\r");
    await waitForFrame(inst, "Step 3/8 — Model");
    inst.input("\r"); // Model optional → advance
    await waitForFrame(inst, "Step 4/8 — Tools");
    inst.input("\r"); // Tools optional → advance
    await waitForFrame(inst, "Step 5/8 — Prompt");
    inst.input("Topic Bot"); // name
    await waitForFrame(inst, "Topic Bot");
    inst.input("\r");
    await waitForFrame(inst, "Step 6/8 — Generate");
    inst.input("g"); // generate
    await waitUntil(() => generate.mock.calls.length > 0);
    const frame = await waitForFrame(inst, "careful researcher");
    expect(frame).toContain("careful researcher");
    inst.unmount();
  });

  it("writes the agent file via the injected fs at Confirm", async () => {
    const onDone = vi.fn();
    const { deps, writes } = fakeDeps({ onDone });
    const inst = renderUi(h(AgentWizard, deps));
    await fillToConfirm(inst);
    await waitForFrame(inst, "Step 8/8 — Confirm");
    inst.input("\r"); // write
    await waitUntil(() => writes.length > 0);
    const written = writes[0];
    expect(written?.path).toBe("/tmp/agents/topic-bot.md");
    expect(written?.content).toContain("name: topic-bot");
    expect(written?.content).toContain("You are a careful researcher.");
    expect(onDone).toHaveBeenCalledWith("/tmp/agents/topic-bot.md");
    inst.unmount();
  });
});

/** Count filled cells (█) in a rendered frame — proxy for progress position. */
function countFilled(frame: string): number {
  return (frame.match(/█/g) ?? []).length;
}

/** Type a value then Enter, waiting for the next-step marker. */
async function drive(inst: ReturnType<typeof renderUi>, steps: [string, string][]): Promise<void> {
  for (const [value, marker] of steps) {
    inst.input(value);
    await waitForFrame(inst, value);
    inst.input("\r");
    await waitForFrame(inst, marker);
  }
}

/** Drive the wizard from Type all the way to the Confirm step. */
async function fillToConfirm(inst: ReturnType<typeof renderUi>): Promise<void> {
  await waitForFrame(inst, "Step 1/8");
  inst.input("researcher");
  await waitForFrame(inst, "researcher");
  inst.input("\r");
  await waitForFrame(inst, "Step 2/8");
  inst.input("Researches topics carefully");
  await waitForFrame(inst, "Researches topics");
  inst.input("\r");
  await waitForFrame(inst, "Step 3/8");
  inst.input("\r"); // model optional
  await waitForFrame(inst, "Step 4/8");
  inst.input("\r"); // tools optional
  await waitForFrame(inst, "Step 5/8");
  inst.input("Topic Bot");
  await waitForFrame(inst, "Topic Bot");
  inst.input("\r");
  await waitForFrame(inst, "Step 6/8");
  inst.input("g"); // generate
  await waitForFrame(inst, "careful researcher");
  inst.input("\r");
  await waitForFrame(inst, "Step 7/8");
  inst.input("\r"); // location (home default)
}
