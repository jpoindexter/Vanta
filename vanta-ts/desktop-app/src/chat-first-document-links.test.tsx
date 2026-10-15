import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatDocumentLinks } from "./chat-first-document-links.js";
import { useDocumentWorkbench } from "./chat-first-documents.js";
import { MessageMarkdown } from "./message-markdown.js";
import type { ChatFirstState } from "./chat-first-state.js";
import type { DesktopSurfaceMode } from "./desktop-surface.js";

let tree: Root;
let host: HTMLElement;

beforeEach(() => {
  const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
  for (const [key, value] of Object.entries({ window, document, Element: window.Element,
    HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
  host = document.getElementById("root")!;
  tree = createRoot(host);
});
afterEach(async () => { await act(async () => tree.unmount()); vi.unstubAllGlobals(); });

type Props = { mode: DesktopSurfaceMode; expand: () => Promise<boolean>; project?: string };
function Workspace({ mode, expand, project = "/projects/Vanta" }: Props) {
  const documents = useDocumentWorkbench(project);
  const [inspector, setInspector] = useState(false);
  const [contextTab, setContextTab] = useState("activity");
  const [view, setView] = useState("connect");
  const state = { documents, inspector, setInspector, contextTab, setContextTab, view, setView,
    data: { status: { root: project } } } as unknown as ChatFirstState;
  return <ChatDocumentLinks state={state} surface={{ mode, expand }}>
    <MessageMarkdown content="[research.md](docs/research.md)" />
    <output>{inspector ? `${view}:${contextTab}:${documents.active}` : "closed"}</output>
    <textarea defaultValue="Keep my unsent draft" />
  </ChatDocumentLinks>;
}

describe("document workbench routing", () => {
  it("opens the actual document tab and inspector without touching the draft", async () => {
    const expand = vi.fn();
    await act(async () => tree.render(<Workspace mode="full" expand={expand} />));
    const composer = host.querySelector("textarea")!;
    composer.value = "Keep my unsent draft";
    await act(async () => host.querySelector("a")!.click());
    expect(host.querySelector("output")?.textContent).toBe("work:files:docs/research.md");
    expect(host.querySelector("textarea")).toBe(composer);
    expect(composer.value).toBe("Keep my unsent draft");
    expect(expand).not.toHaveBeenCalled();
  });

  it("waits for mini to expand before showing the workbench", async () => {
    const expand = vi.fn().mockResolvedValue(true);
    await act(async () => tree.render(<Workspace mode="mini" expand={expand} />));
    await act(async () => host.querySelector("a")!.click());
    expect(expand).toHaveBeenCalledTimes(1);
    expect(host.querySelector("output")?.textContent).toBe("closed");
    await act(async () => tree.render(<Workspace mode="full" expand={expand} />));
    expect(host.querySelector("output")?.textContent).toBe("work:files:docs/research.md");
  });

  it("discards a pending link when project identity changes", async () => {
    const expand = vi.fn().mockResolvedValue(true);
    await act(async () => tree.render(<Workspace mode="mini" expand={expand} />));
    await act(async () => host.querySelector("a")!.click());
    await act(async () => tree.render(<Workspace mode="full" expand={expand} project="/projects/Other" />));
    expect(host.querySelector("output")?.textContent).toBe("closed");
  });

  it("does not unexpectedly open an old link after expansion failed", async () => {
    const expand = vi.fn().mockResolvedValue(false);
    await act(async () => tree.render(<Workspace mode="mini" expand={expand} />));
    await act(async () => host.querySelector("a")!.click());
    await act(async () => tree.render(<Workspace mode="full" expand={expand} />));
    expect(host.querySelector("output")?.textContent).toBe("closed");
  });
});
