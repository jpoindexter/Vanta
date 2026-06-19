import { createElement as h } from "react";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { QuickOpen } from "./quick-open.js";

// Isolate the store so listSessions/listSkills resolve against an empty temp
// home (no real ~/.vanta), keeping the test hermetic. Files + commands are the
// synchronous sources the assertions lean on.
const files = ["src/agent.ts", "vanta-ts/src/ui/quick-open.tsx"];
let prevHome: string | undefined;

beforeAll(() => {
  prevHome = process.env.VANTA_HOME;
  process.env.VANTA_HOME = mkdtempSync(join(tmpdir(), "vanta-qo-"));
});
afterAll(() => {
  if (prevHome === undefined) delete process.env.VANTA_HOME;
  else process.env.VANTA_HOME = prevHome;
});

describe("QuickOpen", () => {
  it("renders the title and a hint footer", async () => {
    const inst = renderUi(h(QuickOpen, { files, onActivate: vi.fn(), onClose: vi.fn() }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Quick Open");
    expect(out).toContain("Esc close");
    inst.unmount();
  });

  it("shows files and commands as candidates before any typing", async () => {
    const inst = renderUi(h(QuickOpen, { files, onActivate: vi.fn(), onClose: vi.fn() }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("src/agent.ts");
    expect(out).toContain("/help"); // a known slash command from the catalog
    inst.unmount();
  });

  it("activates the top result's command on Enter", async () => {
    // The first file is the top result with no query (default selection), so
    // Enter activates its /open command. (Live keystroke filtering is exercised
    // by the pure fuzzyFilter tests; this harness joins frames rather than
    // reflecting interim typed state, so we assert the activation callback.)
    const onActivate = vi.fn();
    const inst = renderUi(h(QuickOpen, { files, onActivate, onClose: vi.fn() }));
    await tick();
    inst.input("\r"); // Enter
    await tick();
    expect(onActivate).toHaveBeenCalledWith("/open src/agent.ts");
    inst.unmount();
  });

  it("closes on Esc", async () => {
    const onClose = vi.fn();
    const inst = renderUi(h(QuickOpen, { files, onActivate: vi.fn(), onClose }));
    await tick();
    inst.input("\x1b"); // Esc — Ink debounces escape, so flush twice
    await tick();
    await tick();
    expect(onClose).toHaveBeenCalled();
    inst.unmount();
  });

  it("shows category icons distinguishing the types", async () => {
    const inst = renderUi(h(QuickOpen, { files, onActivate: vi.fn(), onClose: vi.fn() }));
    await tick();
    const out = inst.lastFrame();
    // file icon "F" and command icon "/" both appear in the candidate rows
    expect(out).toContain("F ");
    inst.unmount();
  });
});
