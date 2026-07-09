import { createElement as h } from "react";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutputStylePanel } from "./output-style-panel.js";
import { renderUi, waitForFrame, waitUntil } from "./test-render.js";

describe("OutputStylePanel", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("renders styles and previews the selected style", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-style-panel-"));
    dirs.push(root);
    const inst = renderUi(h(OutputStylePanel, {
      repoRoot: root,
      data: {
        active: "normal",
        options: [
          { name: "normal", description: "default", body: "Balanced replies.", builtin: true },
          { name: "verbose", description: "long", body: "Explain fully.", builtin: true },
        ],
      },
      onClose: vi.fn(),
    }));
    await waitForFrame(inst, "Output style");
    expect(inst.lastFrame()).toContain("preview: Balanced replies.");
    inst.input("\x1b[B");
    await waitForFrame(inst, "preview: Explain fully.");
    inst.unmount();
  });

  it("closes on escape", async () => {
    const root = mkdtempSync(join(tmpdir(), "vanta-style-panel-"));
    dirs.push(root);
    const onClose = vi.fn();
    const inst = renderUi(h(OutputStylePanel, { repoRoot: root, data: { active: "normal", options: [] }, onClose }));
    inst.input("\x1b");
    await waitUntil(() => onClose.mock.calls.length > 0);
    expect(onClose).toHaveBeenCalled();
    inst.unmount();
  });
});
