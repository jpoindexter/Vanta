import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatTitlebar } from "./chat-titlebar.js";
import type { ChatFirstState } from "./chat-first-state.js";
import type { ChatFirstActions } from "./chat-first-actions.js";

function render(busy = false) {
  const state = { sidebar: true, view: "work", ready: true, pending: false, inspector: false,
    convo: { activeTitle: "Research brief", busy }, documents: { paths: ["notes/brief.md"], active: null }, data: {},
  } as unknown as ChatFirstState;
  return renderToStaticMarkup(<ChatTitlebar state={state} actions={{ navigate: vi.fn() } as unknown as ChatFirstActions}
    surface={{ available: true, mode: "main", toggle: vi.fn() }} />);
}

describe("unified window navigation", () => {
  it("uses a single header, retains real document navigation and hides advanced controls behind disclosure", () => {
    const html = render();
    expect(html.match(/<header/g)).toHaveLength(1);
    expect(html).toContain("Research brief");
    expect(html).toContain("brief.md");
    expect(html).toContain('aria-label="Close notes/brief.md"');
    expect(html.match(/aria-label="Open documents"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Workspace options"');
    expect(html).toContain("Workspace details");
    expect(html).toContain('href="?shell=classic"');
    expect(html).not.toContain("<details open");
    for (const name of ["Start new chat", "Hide sidebar", "Toggle context", "Mini Vanta"]) expect(html).toContain(`aria-label="${name}"`);
  });
  it("preserves the running-chat navigation guard instead of silently abandoning work", () => {
    const html = render(true);
    expect(html).toMatch(/aria-label="Start new chat"[^>]*disabled=""/);
    expect(html).toContain('aria-disabled="true"');
  });
});
