import { createElement as h } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderUi, tick, waitForFrame, waitUntil } from "./test-render.js";
import { GlobalSearchDialog } from "./global-search-dialog.js";
import type { SearchableSession } from "../search/cross-session.js";

// Fixed `now` → deterministic recency. Sessions are injected fixtures, so the
// dialog renders with no fs. Two sessions both match "deno" so ↑/↓ has something
// to move across.
const NOW = Date.parse("2026-06-20T12:00:00Z");

const sessions: SearchableSession[] = [
  {
    id: "20260601-100000",
    title: "kernel safety review",
    messages: [{ role: "user", content: "passing mention of the deno permission flag" }],
  },
  {
    id: "20260610-100000",
    title: "deno permission model",
    messages: [{ role: "user", content: "the deno permission model uses allow-flags" }],
  },
];

function mount(over: Partial<Parameters<typeof GlobalSearchDialog>[0]> = {}) {
  return renderUi(
    h(GlobalSearchDialog, {
      sessions,
      now: NOW,
      onSelect: vi.fn(),
      onClose: vi.fn(),
      ...over,
    }),
  );
}

describe("GlobalSearchDialog", () => {
  it("renders the title and the hint footer", async () => {
    const inst = mount();
    const out = await waitForFrame(inst, "Search all sessions");
    expect(out).toContain("Esc close");
    inst.unmount();
  });

  it("shows ranked results with session context for a typed query", async () => {
    const inst = mount();
    await waitForFrame(inst, "Search all sessions");
    inst.input("deno");
    const out = await waitForFrame(inst, "deno permission model");
    // Session title context + the message-index marker render on the rows.
    expect(out).toContain("msg 0");
    // The exact-phrase + title-hit session ranks first (its snippet is shown).
    expect(out).toContain("allow-flags");
    inst.unmount();
  });

  it("highlights the moved selection on ↓ (inverse marker on the second row)", async () => {
    const inst = mount();
    await waitForFrame(inst, "Search all sessions");
    inst.input("deno");
    await waitForFrame(inst, "deno permission model");
    // Both rows present; default selection is the first (❯ on row 0).
    inst.input("\x1b[B"); // Down arrow
    // After moving down, the ❯ marker sits on the second result row.
    await waitUntil(() => {
      const f = inst.lastFrame();
      const lines = f.split("\n").filter((l) => l.includes("❯"));
      return lines.some((l) => l.includes("kernel safety review"));
    });
    inst.unmount();
  });

  it("calls onSelect with the highlighted hit on Enter", async () => {
    const onSelect = vi.fn();
    const inst = mount({ onSelect });
    await waitForFrame(inst, "Search all sessions");
    inst.input("deno");
    await waitForFrame(inst, "deno permission model");
    inst.input("\r"); // Enter
    await waitUntil(() => onSelect.mock.calls.length > 0);
    const hit = onSelect.mock.calls[0]![0];
    // The top-ranked hit is the exact-phrase + title-hit session.
    expect(hit.sessionId).toBe("20260610-100000");
    expect(hit.snippet).toContain("allow-flags");
    inst.unmount();
  });

  it("calls onClose on Esc", async () => {
    const onClose = vi.fn();
    const inst = mount({ onClose });
    await waitForFrame(inst, "Search all sessions");
    inst.input("\x1b"); // Esc — Ink debounces escape, flush across ticks
    await tick();
    await waitUntil(() => onClose.mock.calls.length > 0);
    expect(onClose).toHaveBeenCalled();
    inst.unmount();
  });

  it("shows a no-matches message when nothing matches the query", async () => {
    const inst = mount();
    await waitForFrame(inst, "Search all sessions");
    inst.input("kubernetes");
    await waitForFrame(inst, "no matches");
    inst.unmount();
  });
});
