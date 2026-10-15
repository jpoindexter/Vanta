import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageSquare } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { SidebarRail } from "./sidebar-rail.js";

describe("LibreChat navigation rail with Vanta commands", () => {
  const item = { id: "chat", label: "Chats", icon: MessageSquare, active: true, onSelect: vi.fn() };

  it("exposes labelled keyboard buttons and preserves selected state", () => {
    const html = renderToStaticMarkup(<SidebarRail items={[item]} header={<span>Vanta</span>}
      extra={<button>Tools & activity</button>} footer={<button>Settings</button>} />);
    expect(html).toContain('aria-label="Workspace navigation"');
    expect(html).toContain('aria-label="Chats"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Tools &amp; activity");
    expect(html).toContain("Settings");
    expect(item.onSelect).not.toHaveBeenCalled();
  });

  it("honors host-disabled actions rather than granting authority in the shell", () => {
    const html = renderToStaticMarkup(<SidebarRail items={[{ ...item, disabled: true }]} />);
    expect(html).toContain('disabled=""');
    expect(item.onSelect).not.toHaveBeenCalled();
  });
});
