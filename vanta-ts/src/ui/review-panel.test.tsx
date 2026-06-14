import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { ReviewPanel } from "./review-panel.js";
import type { ChangedFile } from "../repl/changed-files.js";

const noop = (): void => {};
const files: ChangedFile[] = [
  { file: "src/router.ts", added: 6, removed: 1, status: "M" },
  { file: "src/new.ts", added: 12, removed: 0, status: "?" },
];

describe("ReviewPanel", () => {
  it("lists changed files with +/- stats and the keep/undo hint", async () => {
    const inst = renderUi(h(ReviewPanel, { files, cwd: "/tmp/x", onClose: noop }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Review changes · 2 files");
    expect(out).toContain("src/router.ts");
    expect(out).toContain("+6");
    expect(out).toContain("-1");
    expect(out).toContain("u undo");
    inst.unmount();
  });

  it("renders the empty state when the tree is clean", async () => {
    const inst = renderUi(h(ReviewPanel, { files: [], cwd: "/tmp/x", onClose: noop }));
    await tick();
    expect(inst.lastFrame()).toContain("no changes");
    inst.unmount();
  });
});
