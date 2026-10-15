import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import { EntryView } from "./transcript.js";
import { estimateEntryRows } from "./layout-rows.js";
import { renderUi, tick } from "./test-render.js";
import type { ToolEntry } from "./types.js";

const tool = (fields: Partial<ToolEntry>): ToolEntry => ({
  kind: "tool",
  name: "read_file",
  verb: "read",
  detail: "src/app.ts",
  ok: true,
  summary: "20 lines",
  ...fields,
});

describe("TUI output hierarchy", () => {
  it("compresses a long successful run into one evidence line", async () => {
    const tools = [
      tool({ name: "read_file", verb: "read", detail: "src/a.ts" }),
      tool({ name: "grep_files", verb: "searched", detail: "src" }),
      tool({ name: "edit_file", verb: "edited", detail: "src/a.ts", diff: [{ type: "add", text: "const clean = true;" }] }),
      tool({ name: "write_file", verb: "wrote", detail: "src/b.ts" }),
      tool({ name: "shell_cmd", verb: "ran", detail: "npm test", summary: "5 passed" }),
    ];
    const inst = renderUi(h(EntryView, { entry: { kind: "toolGroup", tools } }));
    await tick();
    const out = inst.lastFrame();

    expect(out).toContain("5 actions");
    expect(out).toContain("2 read/search");
    expect(out).toContain("2 edits");
    expect(out).toContain("1 command");
    expect(out).toContain("Ctrl+T evidence");
    expect(out).not.toContain("src/a.ts");
    expect(out).not.toContain("const clean");
    expect(estimateEntryRows({ kind: "toolGroup", tools }, 100)).toBe(2);
    inst.unmount();
  });

  it("keeps a failed action expanded beside the compact successful evidence", async () => {
    const tools = [
      tool({ name: "read_file", verb: "read", detail: "src/a.ts" }),
      tool({ name: "grep_files", verb: "searched", detail: "src" }),
      tool({ name: "write_file", verb: "wrote", detail: "src/b.ts" }),
      tool({ name: "shell_cmd", verb: "ran", detail: "npm test", ok: false, errorLine: "2 tests failed" }),
    ];
    const inst = renderUi(h(EntryView, { entry: { kind: "toolGroup", tools } }));
    await tick();
    const out = inst.lastFrame();

    expect(out).toContain("3 completed");
    expect(out).toContain("Ran(npm test)");
    expect(out).toContain("2 tests failed");
    inst.unmount();
  });

  it("renders Markdown headings as hierarchy without literal hash noise", async () => {
    const inst = renderUi(h(EntryView, {
      entry: { kind: "assistant", text: "## Result\n\nThe patch is ready." },
    }));
    await tick();
    const out = inst.lastFrame();

    expect(out).toContain("Result");
    expect(out).not.toContain("## Result");
    inst.unmount();
  });
});
