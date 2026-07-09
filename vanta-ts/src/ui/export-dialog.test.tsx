import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderUi, tick, waitForFrame } from "./test-render.js";
import { ExportDialog } from "./export-dialog.js";
import type { ExportContext } from "./export-actions.js";

const context: ExportContext = {
  sessionId: "s1",
  title: "Demo",
  messages: [
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi there" },
  ],
};

describe("ExportDialog", () => {
  it("renders options and a preview", async () => {
    const inst = renderUi(h(ExportDialog, { repoRoot: mkdtempSync(join(tmpdir(), "vanta-export-ui-")), context, onClose: () => {} }));
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("Export conversation");
    expect(frame).toContain("Format: markdown");
    expect(frame).toContain("# Demo");
    inst.unmount();
  });

  it("cycles the format row with Enter", async () => {
    const inst = renderUi(h(ExportDialog, { repoRoot: mkdtempSync(join(tmpdir(), "vanta-export-ui-")), context, onClose: () => {} }));
    inst.input("\r");
    const frame = await waitForFrame(inst, "Format: json");
    expect(frame).toContain('"sessionId": "s1"');
    inst.unmount();
  });
});
