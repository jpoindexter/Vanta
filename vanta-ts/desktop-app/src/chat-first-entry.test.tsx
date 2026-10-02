import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatToolsNavigation } from "./chat-first-tools-navigation.js";
import { ChatWelcome, chatStarters } from "./chat-first-welcome.js";

describe("chat-first entry", () => {
  it("starts with a collapsed, labelled utility disclosure and retains all six destinations", () => {
    const html = renderToStaticMarkup(<ChatToolsNavigation view="work" onNavigate={vi.fn()} />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="chat-feature-destinations"');
    expect(html).toContain('id="chat-feature-destinations"');
    expect(html).toContain('hidden=""');
    for (const label of ["Today", "Outputs", "Library", "Schedules", "Skills &amp; tools", "Connections"]) {
      expect(html).toContain(label);
    }
  });

  it("identifies the active utility even when its list is collapsed", () => {
    const html = renderToStaticMarkup(<ChatToolsNavigation view="connect" onNavigate={vi.fn()} />);
    expect(html).toContain("Viewing Connections");
    expect(html).toContain('aria-current="page"');
  });

  it("offers three editable general-purpose starters, not an execution shortcut", () => {
    const onDraft = vi.fn();
    const html = renderToStaticMarkup(<ChatWelcome draft="" ready onDraft={onDraft} />);
    expect(chatStarters).toHaveLength(3);
    expect(html).toContain('aria-label="Ideas to start a chat"');
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(onDraft).not.toHaveBeenCalled();
  });

  it("never offers to overwrite an existing draft", () => {
    const html = renderToStaticMarkup(<ChatWelcome draft="My unfinished thought" ready onDraft={vi.fn()} />);
    expect(html).not.toContain("chat-starters");
  });

  it("does not allow starter selection before the session is ready", () => {
    const html = renderToStaticMarkup(<ChatWelcome draft="" ready={false} onDraft={vi.fn()} />);
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
});
