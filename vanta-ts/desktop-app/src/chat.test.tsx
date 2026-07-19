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

  it("shows a Schema model mismatch and one safe next action", () => {
    const recovery: DesktopRunReceipt = {
      status: "failed",
      failureKind: "model_mismatch",
      events: [{ label: "Model diverged", ok: false }],
      actions: ["edit_request", "start_from_checkpoint"],
      counterexample: {
        modelVersion: 4,
        transition: "run-7:12",
        path: "$.counters.steps.value",
        predicted: "2",
        observed: "6",
        safeNextAction: "revise state or model",
      },
    };
    const html = renderToStaticMarkup(
      <ChatThread
        messages={[]}
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
    expect(html).toContain("Failure: model mismatch");
    expect(html).toContain("$.counters.steps.value");
    expect(html).toContain("Predicted 2; observed 6");
    expect(html).toContain("Safe next: revise state or model");
  });

  it("shows provider reconnection instead of approval or blind retry", () => {
    const recovery: DesktopRunReceipt = {
      status: "failed",
      failureKind: "provider_auth",
      events: [{ label: "Provider authentication required.", ok: false }],
      actions: ["edit_request", "start_from_checkpoint"],
      checkpoint: { instruction: "check my email" },
    };
    const html = renderToStaticMarkup(
      <ChatThread messages={[]} busy={false} streamText="" events={[]} recovery={recovery} approval={null} onApproval={vi.fn()} onRetry={vi.fn()} onReconnect={vi.fn()} onPrompt={vi.fn()} />,
    );
    expect(html).toContain("Provider authentication required");
    expect(html).toContain("Reconnect model");
    expect(html).not.toContain("Retry failed step");
    expect(html).not.toContain("approval denied");
  });
});

describe("ChatThread quiet trace", () => {
  it("collapses repeated reads and keeps full evidence keyboard-expandable", () => {
    const html = renderToStaticMarkup(
      <ChatThread
        messages={[]}
        busy={true}
        streamText=""
        events={[
          { label: "✓ read_file: first", kind: "tool_end", name: "read_file", ok: true, detail: "first full output" },
          { label: "✓ grep_files: second", kind: "tool_end", name: "grep_files", ok: true, detail: "second full output" },
          { label: "note: internal policy narration", kind: "note", detail: "internal policy narration" },
        ]}
        recovery={null}
        approval={null}
        onApproval={vi.fn()}
        onRetry={vi.fn()}
        onPrompt={vi.fn()}
      />,
    );
    expect(html).toContain("Read and searched 2 times");
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).toContain("first full output");
    expect(html).toContain("second full output");
    expect(html).not.toContain("internal policy narration");
  });
});

describe("ChatThread approval checkpoint", () => {
  it("renders action type, target, reason, preview, and approval controls", () => {
    const html = renderToStaticMarkup(
      <ChatThread
        messages={[{ role: "assistant", content: "I need approval before changing a file." }]}
        busy={false}
        streamText=""
        events={[]}
        recovery={null}
        approval={{
          id: "approval-1",
          action: "Edit file desktop-app/src/chat.tsx",
          reason: "modifying existing file content",
          toolName: "edit_file",
          request: {
            kind: "file_edit",
            title: "File edit permission request",
            subject: "desktop-app/src/chat.tsx",
            reason: "modifying existing file content",
            sections: [
              { label: "Target file", value: "desktop-app/src/chat.tsx", tone: "code" },
              { label: "Preview", value: "- old\n+ new", tone: "code" },
            ],
          },
        }}
        onApproval={vi.fn()}
        onRetry={vi.fn()}
        onPrompt={vi.fn()}
      />,
    );

    expect(html).toContain("Approval required");
    expect(html).toContain("File edit permission request");
    expect(html).toContain("desktop-app/src/chat.tsx");
    expect(html).toContain("modifying existing file content");
    expect(html).toContain("Preview");
    expect(html).toContain("- old");
    expect(html).toContain("+ new");
    expect(html).toContain("Allow once");
    expect(html).toContain("Reject");
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
        accessMode="ask"
        attachments={["desktop-app/src/App.tsx"]}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onQueue={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onStop={vi.fn()}
        onAttach={vi.fn()}
        onMcp={vi.fn()}
        onModel={vi.fn()}
        onAccessMode={vi.fn(async () => undefined)}
        onCommand={vi.fn()}
      />,
    );

    expect(html).toContain("Session model");
    expect(html).toContain("Tools 42");
    expect(html).toContain("MCP 0 · 0 tools");
    expect(html).toContain("Memory local");
    expect(html).toContain('class="approval-mode mode-ask"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain(">Ask</span>");
    expect(html).toContain("gpt-5.5");
    expect(html).toContain("Agent model");
    expect(html).toContain("Agent model: gpt-5.5. Change model");
    expect(html).toContain("desktop-app/src/App.tsx");
    expect(html).toContain("Remove desktop-app/src/App.tsx");
  });
});

describe("assistant message actions", () => {
  it("renders Codex-style actions after assistant and operator messages", () => {
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
    expect(html).toContain("Copy message");
    expect(html).toContain("Mark helpful");
    expect(html).toContain("Mark not helpful");
    expect(html).toContain("Expand response");
    expect(html).toContain("<time");
    expect(html.match(/Response actions/g)).toHaveLength(1);
    expect(html.match(/Message actions/g)).toHaveLength(1);
    expect(html).not.toContain("message-meta");
  });
});
