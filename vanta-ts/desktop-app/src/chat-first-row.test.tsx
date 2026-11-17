import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatRow } from "./chat-first-row.js";

describe("ChatRow", () => {
  const props = { session: { id: "one", title: "Long project conversation", turns: 4, updated: "2026-09-08" },
    active: true, locked: false, onOpen: vi.fn(), onPin: vi.fn(), onArchive: vi.fn(), onRename: vi.fn() };
  it("keeps actions accessible without hover and exposes real metadata", () => {
    const html = renderToStaticMarkup(<ChatRow {...props} />);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="Actions for Long project conversation"');
    expect(html).toContain("4 turns");
    expect(html).toContain('role="tooltip"');
    expect(html).not.toContain("verified");
  });
  it("disables switching while the single conversation engine is busy", () => {
    const html = renderToStaticMarkup(<ChatRow {...props} locked />);
    expect(html).toContain("Stop the current response before switching chats.");
    expect(html).toContain('disabled=""');
  });
  it("allows returning to the current running chat while keeping its mutation menu locked", () => {
    const html = renderToStaticMarkup(<ChatRow {...props} active={false} currentSession locked />);
    const openingButton = html.split("</button>")[0];
    expect(openingButton).not.toContain('disabled=""');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('aria-current="page"');
  });
  it("does not invent a project or execution host for older chat metadata", () => {
    const html = renderToStaticMarkup(<ChatRow {...props} />);
    expect(html).toContain("Project not recorded");
    expect(html).toContain("Saved chat");
    expect(html).not.toContain("Standalone");
    expect(html).not.toContain("Running locally");
  });
  it("shows the recorded project identifier rather than the current workspace", () => {
    const session = { ...props.session, projectId: "recorded-project-123", archived: true };
    const html = renderToStaticMarkup(<ChatRow {...props} session={session} />);
    expect(html).toContain("Project ID: recorded-project-123");
    expect(html).toContain("Archived chat");
  });
});
