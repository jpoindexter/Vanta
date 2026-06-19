import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { Banner } from "./banner.js";
import { EntryView } from "./transcript.js";
import { SlashPalette } from "./slash-palette.js";
import { AtPalette } from "./at-palette.js";
import { OverlayList } from "./overlay-list.js";
import { CockpitPanel } from "./cockpit-panel.js";
import { HelpPanel } from "./help-panel.js";
import { TodoPanel, planMeter } from "./todo-panel.js";
import { StatusBar } from "./status-bar.js";
import { Footer } from "./app.js";
import { matchSlash } from "./slash.js";
import { EMPTY_COCKPIT } from "../tui/mission-control/cockpit-data.js";

describe("Banner", () => {
  it("renders the name, model, and kernel line", async () => {
    const inst = renderUi(h(Banner, { model: "claude-sonnet-4-6", cwd: "~/dev/site", kernel: "127.0.0.1:7788", tools: 49, cmds: 41 }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("█"); // the VANTA block wordmark
    expect(out).toContain("local trusted operator");
    expect(out).toContain("claude-sonnet-4-6");
    expect(out).toContain("127.0.0.1:7788");
    expect(out).toContain("49 tools");
    inst.unmount();
  });
});

describe("EntryView", () => {
  it("renders a user line with the ❯ glyph", async () => {
    const inst = renderUi(h(EntryView, { entry: { kind: "user", text: "hello" } }));
    await tick();
    expect(inst.lastFrame()).toContain("❯ hello");
    inst.unmount();
  });

  it("renders a completed tool Claude-style: ⏺ Verb(detail) over a ⎿ result", async () => {
    const inst = renderUi(h(EntryView, { entry: { kind: "tool", name: "read_file", verb: "read", detail: "x.ts", ok: true, summary: "48 lines" } }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("⏺");
    expect(out).toContain("Read(x.ts)");
    expect(out).toContain("⎿");
    expect(out).toContain("48 lines");
    inst.unmount();
  });

  it("renders a failed tool with the error on the ⎿ line", async () => {
    const inst = renderUi(h(EntryView, { entry: { kind: "tool", name: "shell_cmd", verb: "ran", detail: "x", ok: false, errorLine: "boom" } }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Ran(x)");
    expect(out).toContain("boom");
    inst.unmount();
  });

  it("renders a tool's diff inline with +/- lines", async () => {
    const diff = [{ type: "add" as const, text: "added me" }, { type: "remove" as const, text: "gone now" }];
    const inst = renderUi(h(EntryView, { entry: { kind: "tool", name: "write_file", verb: "wrote", detail: "y.ts", ok: true, diff } }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("+ added me");
    expect(out).toContain("- gone now");
    inst.unmount();
  });

  it("renders thinking as a dim multi-line panel", async () => {
    const inst = renderUi(h(EntryView, { entry: { kind: "thinking", text: "first thought\nsecond thought" } }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("thinking");
    expect(out).toContain("first thought");
    inst.unmount();
  });

  it("renders a note with its url + file:line text intact (clickable spans)", async () => {
    const inst = renderUi(h(EntryView, { entry: { kind: "note", text: "see https://example.com and src/a.ts:9" } }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("https://example.com");
    expect(out).toContain("src/a.ts:9");
    inst.unmount();
  });

  it("renders a tool group as sequential ⏺ Verb(detail) calls (no group header)", async () => {
    const tools = [
      { kind: "tool" as const, name: "read_file", verb: "read", detail: "x.ts", ok: true, summary: "48 lines" },
      { kind: "tool" as const, name: "write_file", verb: "wrote", detail: "y.ts", ok: true, summary: "+6/-0" },
    ];
    const inst = renderUi(h(EntryView, { entry: { kind: "toolGroup", tools } }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Read(x.ts)");
    expect(out).toContain("Wrote(y.ts)");
    expect(out).toContain("48 lines");
    expect(out).not.toContain("actions"); // no grouped "N actions" header
    inst.unmount();
  });
});

describe("SlashPalette", () => {
  it("lists matching commands above the composer", async () => {
    const inst = renderUi(h(SlashPalette, { matches: matchSlash("/mod"), sel: 0 }));
    await tick();
    expect(inst.lastFrame()).toContain("/model");
    inst.unmount();
  });

  it("renders nothing when there are no matches", async () => {
    const inst = renderUi(h(SlashPalette, { matches: [], sel: 0 }));
    await tick();
    expect(inst.lastFrame().trim()).toBe("");
    inst.unmount();
  });
});

describe("AtPalette", () => {
  it("lists matching files with the @ glyph", async () => {
    const inst = renderUi(h(AtPalette, { files: ["src/app.ts", "src/composer.tsx"], sel: 0 }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("@src/app.ts");
    expect(out).toContain("@src/composer.tsx");
    inst.unmount();
  });
});

describe("inline overlays", () => {
  const noop = (): void => {};
  it("OverlayList renders a title and rows", async () => {
    const rows = [{ label: "gpt-4o", hint: "openai", command: "/model openai" }];
    const inst = renderUi(h(OverlayList, { title: "Switch model", rows, onSelect: noop, onClose: noop }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Switch model");
    expect(out).toContain("gpt-4o");
    inst.unmount();
  });

  it("OverlayList shows a row's status mark (● current) in its own column", async () => {
    const rows = [{ label: "openai", command: "/model openai", mark: "●" }, { label: "gemini", command: "/model gemini" }];
    const inst = renderUi(h(OverlayList, { title: "Switch model", rows, onSelect: noop, onClose: noop }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("●");
    expect(out).toContain("openai");
    inst.unmount();
  });

  it("CockpitPanel renders the kernel verdict ladder", async () => {
    const inst = renderUi(h(CockpitPanel, { data: EMPTY_COCKPIT, onClose: noop }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("Mission control");
    expect(out).toContain("allow");
    expect(out).toContain("block");
    inst.unmount();
  });

  it("HelpPanel renders the shortcut card", async () => {
    const inst = renderUi(h(HelpPanel, { onClose: noop }));
    await tick();
    expect(inst.lastFrame()).toContain("Shortcuts");
    inst.unmount();
  });

  it("TodoPanel renders the plan with a meter + status counts", async () => {
    const todos = [{ text: "ship it", status: "in_progress" as const }, { text: "done thing", status: "done" as const }];
    const inst = renderUi(h(TodoPanel, { todos }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("plan");
    expect(out).toContain("✓1"); // done
    expect(out).toContain("◐1"); // in progress
    expect(out).toContain("▰");  // progress meter
    expect(out).toContain("ship it");
    inst.unmount();
  });

  it("planMeter fills 4 cells by share done", () => {
    expect(planMeter(0, 4)).toBe("▱▱▱▱");
    expect(planMeter(2, 4)).toBe("▰▰▱▱");
    expect(planMeter(4, 4)).toBe("▰▰▰▰");
    expect(planMeter(0, 0)).toBe("▱▱▱▱"); // no divide-by-zero
  });

  it("TodoPanel renders nothing for an empty plan", async () => {
    const inst = renderUi(h(TodoPanel, { todos: [] }));
    await tick();
    expect(inst.lastFrame().trim()).toBe("");
    inst.unmount();
  });

  it("TodoPanel hides a fully-complete plan (no more 'stuck at ✓4')", async () => {
    const todos = [{ text: "a", status: "done" as const }, { text: "b", status: "done" as const }];
    const inst = renderUi(h(TodoPanel, { todos }));
    await tick();
    expect(inst.lastFrame().trim()).toBe("");
    inst.unmount();
  });
});

describe("Footer", () => {
  const baseProps = { model: "gpt-4o", effortLevel: "medium" as const, ctxPct: 0, tokens: 0, contextWindow: 128000, turns: 0, busy: false, queued: 0, mcp: false, elapsed: "0s" };

  it("renders 3 physical lines when goal is null (space placeholder keeps height=1)", async () => {
    const inst = renderUi(h(Footer, { ...baseProps, goal: null }));
    await tick();
    // Count \n characters — the space placeholder renders as a blank row ("\n") that
    // l.length>0 and l.trim() both incorrectly discard, so we count newlines directly.
    // Before the fix, "" collapsed to 0 lines in Ink: 2 \n here instead of 3, causing
    // clock-tick re-renders to accumulate 1 ghost line per second.
    const nlCount = (inst.lastFrame().match(/\n/g) ?? []).length;
    expect(nlCount).toBe(3);
    inst.unmount();
  });

  it("renders the same number of lines with goal=null as with a real goal (height stable)", async () => {
    const withGoal = renderUi(h(Footer, { ...baseProps, goal: "Analyze Vanta roadmap" }));
    await tick();
    const goalNl = (withGoal.lastFrame().match(/\n/g) ?? []).length;
    withGoal.unmount();

    const noGoal = renderUi(h(Footer, { ...baseProps, goal: null }));
    await tick();
    const noGoalNl = (noGoal.lastFrame().match(/\n/g) ?? []).length;
    noGoal.unmount();

    expect(noGoalNl).toBe(goalNl);
  });
});

describe("StatusBar", () => {
  it("shows model, a context gauge, turns, and the interrupt hint when busy", async () => {
    const inst = renderUi(h(StatusBar, { model: "claude-sonnet-4-6", ctxPct: 12, tokens: 24000, contextWindow: 200000, turns: 3, busy: true }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("claude-sonnet-4-6");
    expect(out).toContain("24k/200k");
    expect(out).toContain("12%");
    expect(out).toContain("█"); // context bar
    expect(out).toContain("3 turns");
    expect(out).toContain("esc to interrupt");
    inst.unmount();
  });

  it("shows the shortcuts hint when idle", async () => {
    const inst = renderUi(h(StatusBar, { model: "gpt-4o", ctxPct: 0, tokens: 0, contextWindow: 128000, turns: 1, busy: false }));
    await tick();
    const out = inst.lastFrame();
    expect(out).toContain("1 turn");
    expect(out).toContain("? shortcuts");
    inst.unmount();
  });

  it("shows the session timer when provided", async () => {
    const inst = renderUi(h(StatusBar, { model: "gpt-5.5", ctxPct: 5, tokens: 13000, contextWindow: 272000, turns: 2, busy: false, elapsed: "1m09s" }));
    await tick();
    expect(inst.lastFrame()).toContain("◷ 1m09s");
    inst.unmount();
  });

  it("shows the MCP chip when configured (and there's room for it)", async () => {
    const inst = renderUi(h(StatusBar, { model: "gpt", ctxPct: 5, tokens: 1000, contextWindow: 128000, turns: 1, busy: false, mcp: true }));
    await tick();
    expect(inst.lastFrame()).toContain("MCP ✓");
    inst.unmount();
  });

  it("omits the timer + MCP chip when not provided", async () => {
    const inst = renderUi(h(StatusBar, { model: "gpt-5.5", ctxPct: 5, tokens: 13000, contextWindow: 272000, turns: 2, busy: false }));
    await tick();
    const out = inst.lastFrame();
    expect(out).not.toContain("◷");
    expect(out).not.toContain("MCP");
    inst.unmount();
  });
});
