import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseHTML } from "linkedom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentLinkContext } from "./document-link-context.js";
import { MessageMarkdown } from "./message-markdown.js";
import { DocumentPreview } from "./chat-first-documents.js";

let tree: Root;
let host: HTMLElement;

beforeEach(() => {
  const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
  for (const [key, value] of Object.entries({ window, document, Element: window.Element,
    HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
  host = document.getElementById("root")!;
  tree = createRoot(host);
});

afterEach(async () => {
  await act(async () => tree.unmount());
  vi.unstubAllGlobals();
});

function ResearchResult() {
  const [path, setPath] = useState<string | null>(null);
  return <DocumentLinkContext.Provider value={{ root: "/projects/Vanta", open: setPath }}>
    <MessageMarkdown content="Created and verified: [research.md](vanta-ts/.artifacts/research.md)" />
    {path ? <DocumentPreview path={path} onAttach={vi.fn()} /> : null}
  </DocumentLinkContext.Provider>;
}

describe("chat result to document preview", () => {
  it("opens the clicked project result through the read-only preview API", async () => {
    const path = "vanta-ts/.artifacts/research.md";
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ path,
      content: "# Verified research\n\n[Source](https://example.com)", markdown: true })));
    vi.stubGlobal("fetch", fetch);
    await act(async () => tree.render(<ResearchResult />));
    const link = host.querySelector("a")!;
    expect(link.getAttribute("aria-disabled")).not.toBe("true");
    await act(async () => link.click());
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/file-preview?path=${encodeURIComponent(path)}`, expect.any(Object));
    expect(host.querySelector('a[data-document-link]')).toBe(link);
    expect(host.querySelector('section[aria-label="Document vanta-ts/.artifacts/research.md"] h1')?.textContent).toBe("Verified research");
    expect(host.querySelector('a[href="https://example.com"]')?.getAttribute("target")).toBe("_blank");
  });

  it.each(["../private.md", "javascript:alert(1)", "file:///private/report.md", "//evil.example/test"])("keeps %s inert", async (href) => {
    const open = vi.fn();
    await act(async () => tree.render(<DocumentLinkContext.Provider value={{ root: "/projects/Vanta", open }}>
      <MessageMarkdown content={`[unsafe](${href})`} />
    </DocumentLinkContext.Provider>));
    await act(async () => host.querySelector("a")!.click());
    expect(open).not.toHaveBeenCalled();
    expect(host.querySelector("a")!.getAttribute("aria-disabled")).toBe("true");
  });

  it("shows a recoverable error when the server refuses a private file", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 403 })));
    await act(async () => tree.render(<ResearchResult />));
    await act(async () => host.querySelector("a")!.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("cannot be previewed");
    expect(host.querySelector('button[disabled]')?.textContent).toBe("Attach to chat");
  });
});
