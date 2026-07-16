import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatThread, Composer } from "./chat.js";
import type { DesktopRunReceipt } from "./types.js";

describe("ChatThread recovery", () => {
  it("renders failed-run receipts with the recovery actions", () => {
    const recovery: DesktopRunReceipt = {
      status: "failed",
      failureKind: "tool",
      events: [{ label: "tool failed", ok: false }],
      actions: ["retry_failed_step", "edit_request", "start_from_checkpoint"],
      checkpoint: { instruction: "fix the desktop app", partialText: "Changed the renderer state." },
    };

    const html = renderToStaticMarkup(
      <ChatThread
        messages={[{ role: "assistant", content: "The run stopped before completing.", desktopRun: recovery }]}
        busy={false}
        streamText=""
        events={[]}
        recovery={recovery}
        approval={null}
        onApproval={vi.fn()}
        onRetry={vi.fn()}
        onPrompt={vi.fn()}
      />,
    );

    expect(html).toContain("Run needs attention");
    expect(html).toContain("Partial output and timeline were saved");
    expect(html).toContain("Failure: tool");
    expect(html).toContain("Retry failed step");
    expect(html).toContain("Edit request");
    expect(html).toContain("Start from checkpoint");
  });
});

describe("Composer context legibility", () => {
  it("renders model scope, tools, memory, approval state, and removable file chips", () => {
    const html = renderToStaticMarkup(
      <Composer
        value=""
        busy={false}
        model="gpt-5.5"
        root="/Users/jasonpoindexter/Documents/GitHub/docs/Vanta"
        tools={42}
        attachments={["desktop-app/src/App.tsx"]}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onQueue={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onStop={vi.fn()}
        onAttach={vi.fn()}
        onModel={vi.fn()}
        onCommand={vi.fn()}
      />,
    );

    expect(html).toContain("Session model");
    expect(html).toContain("Tools 42");
    expect(html).toContain("Memory local");
    expect(html).toContain("Ask before risk");
    expect(html).toContain("gpt-5.5");
    expect(html).toContain("desktop-app/src/App.tsx");
    expect(html).toContain("Remove desktop-app/src/App.tsx");
  });
});

describe("assistant message actions", () => {
  it("renders copy, feedback, expand, and timestamp controls for assistant responses only", () => {
    const html = renderToStaticMarkup(
      <ChatThread
        messages={[
          { role: "user", content: "Can you fix the desktop app?" },
          { role: "assistant", content: "I will keep the transcript readable and expose response actions." },
        ]}
        busy={false}
        streamText=""
        events={[]}
        recovery={null}
        approval={null}
        onApproval={vi.fn()}
        onRetry={vi.fn()}
        onPrompt={vi.fn()}
      />,
    );

    expect(html).toContain("Copy response");
    expect(html).toContain("Mark helpful");
    expect(html).toContain("Mark not helpful");
    expect(html).toContain("Expand response");
    expect(html).toContain("<time");
    expect(html.match(/Response actions/g)).toHaveLength(1);
  });
});
