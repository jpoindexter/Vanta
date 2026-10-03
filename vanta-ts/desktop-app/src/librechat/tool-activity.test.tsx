import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { describe, expect, it, vi } from "vitest";
import { EventTimeline, RunTimeline } from "../chat-run-feedback.js";
import { ChatThread } from "../chat-thread.js";
import type { Message } from "../types.js";

const calls = [{ id: "read-1", name: "read_file" }, { id: "write-1", name: "write_file" }];
const messages: Message[] = [
  { role: "tool", toolCallId: "read-1", content: "A long source document." },
  { role: "tool", toolCallId: "write-1", content: "Provider rejected this write." },
];
const documentFor = (node: React.ReactNode) => parseHTML(`<html><body>${renderToStaticMarkup(node)}</body></html>`).document.body;

describe("LibreChat-derived compact tool activity", () => {
  it("starts with one collapsed summary, not raw tool-output cards", () => {
    const doc = documentFor(<RunTimeline calls={calls} messages={messages} />);
    const group = doc.querySelector("details.lc-tool-group");
    expect(group).not.toBeNull();
    expect(group?.hasAttribute("open")).toBe(false);
    const summary = group?.querySelector("summary")?.textContent;
    expect(summary).toContain("Read file, Write file");
    expect(summary).toContain("2 results received");
    expect(summary).not.toContain("A long source");
    expect(summary).not.toContain("done");
    expect(summary).not.toContain("success");
    expect(doc.querySelectorAll("pre")).toHaveLength(2);
    expect(doc.textContent).toContain("Provider rejected this write.");
  });

  it("does not invent running or success when a saved call has no result", () => {
    const doc = documentFor(<RunTimeline calls={calls} messages={messages.slice(0, 1)} />);
    expect(doc.querySelector("summary")?.textContent).toContain("1 result not recorded");
    expect(doc.textContent).not.toContain("running");
    expect(doc.textContent).not.toContain("done");
    expect(doc.textContent).toContain("No result recorded.");
  });

  it("distinguishes an empty returned result and escapes untrusted output", () => {
    const doc = documentFor(<RunTimeline calls={calls} messages={[
      { ...messages[0], content: "" }, { ...messages[1], content: "<img src=x onerror=alert(1)>" },
    ]} />);
    expect(doc.querySelector("summary")?.textContent).toContain("2 results received");
    expect(doc.textContent).toContain("Empty result.");
    expect(doc.querySelector("img")).toBeNull();
    expect(doc.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("has no empty wrapper when there are no calls", () => {
    expect(renderToStaticMarkup(<RunTimeline calls={[]} messages={[]} />)).toBe("");
  });

  it("keeps failed and active activity outside the collapsed completed evidence", () => {
    const doc = documentFor(<EventTimeline events={[
      { label: "Read source", kind: "tool_end", name: "read_file", ok: true, detail: "full source" },
      { label: "Write rejected", kind: "tool_end", name: "write_file", ok: false, detail: "Permission denied" },
      { label: "Waiting for tool", kind: "tool_start", name: "web_fetch" },
    ]} />);
    const completed = doc.querySelector(".lc-completed-trace");
    expect(completed?.hasAttribute("open")).toBe(false);
    expect(completed?.textContent).toContain("full source");
    expect(completed?.textContent).not.toContain("Write rejected");
    const failed = doc.querySelector('[data-status="attention"]');
    expect(failed?.hasAttribute("open")).toBe(true);
    expect(failed?.textContent).toContain("Permission denied");
    expect(doc.querySelector('[data-status="active"] summary')?.textContent).toContain("Waiting for tool");
  });

  it("retains every earlier output, not only the earlier event labels", () => {
    const events = Array.from({ length: 9 }, (_, index) => ({
      label: `Action ${index}`, ok: true, kind: "tool_end" as const, name: `action_${index}`, detail: `Evidence ${index}`,
    }));
    const doc = documentFor(<EventTimeline events={events} />);
    expect(doc.querySelectorAll(".lc-completed-trace pre")).toHaveLength(9);
    for (const event of events) expect(doc.textContent).toContain(event.detail);
  });

  it("does not render a blank assistant bubble before a tool-only turn", () => {
    const doc = documentFor(<ChatThread title="Test" queueCount={0}
      messages={[{ role: "assistant", content: "  ", toolCalls: calls }, ...messages]}
      busy={false} streamText="" events={[]} recovery={null} approval={null}
      onApproval={vi.fn()} onRetry={vi.fn()} onPrompt={vi.fn()} />);
    expect(doc.querySelectorAll("article.message")).toHaveLength(0);
    expect(doc.querySelectorAll(".lc-tool-group")).toHaveLength(1);
  });
});
