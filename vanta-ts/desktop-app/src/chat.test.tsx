import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChatThread } from "./chat.js";
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
