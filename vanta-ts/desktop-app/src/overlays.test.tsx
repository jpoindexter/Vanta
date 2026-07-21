import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ApprovalOverlay, CommandPalette, ModelPicker, SetupWizard } from "./overlays.js";

describe("CommandPalette", () => {
  it("exposes Telegram setup when slash opens quick actions", () => {
    const html = renderToStaticMarkup(<CommandPalette open onClose={vi.fn()} onNew={vi.fn()} onModel={vi.fn()} onTelegram={vi.fn()} onSound={vi.fn()} onSettings={vi.fn()} onTab={vi.fn()} />);
    expect(html).toContain("Set up Telegram");
  });
});

describe("ApprovalOverlay", () => {
  it("renders request context with one-time approval only", () => {
    const html = renderToStaticMarkup(
      <ApprovalOverlay
        approval={{
          id: "a1",
          action: "run shell command: git status --short",
          reason: "kernel ask",
          toolName: "shell_cmd",
          request: {
            kind: "bash",
            title: "Bash permission request",
            subject: "git status --short",
            reason: "kernel ask",
            sections: [{ label: "Command", value: "git status --short", tone: "code" }],
          },
        }}
        onAnswer={vi.fn()}
      />,
    );

    expect(html).toContain("Bash permission request");
    expect(html).toContain("Command");
    expect(html).toContain("git status --short");
    expect(html).toContain("Allow once");
    expect(html).toContain("Reject");
    expect(html).not.toContain("Always allow");
    expect(html).not.toContain("Never allow");
    expect(html).toContain('role="dialog"');
  });
});

describe("ModelPicker", () => {
  it("groups models by provider and exposes an explicit default action", () => {
    const html = renderToStaticMarkup(
      <ModelPicker
        open
        models={[{ id: "ollama", label: "Ollama", short: "Local", models: ["qwen"], current: true, savedDefaultModel: "qwen", modelSource: "live", discoveryAvailable: true }]}
        status={{ kernel: "ready", model: "qwen", provider: "ollama", tools: 1, sessionId: "s1" }}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(html).toContain("Choose a model");
    expect(html).toContain("Search models and providers");
    expect(html).toContain("Ollama");
    expect(html).toContain("Live provider catalog");
    expect(html).toContain("This task");
    expect(html).toContain("Default");
    expect(html).toContain("Ollama qwen is the default");
    expect(html).toContain("Use a model ID that is not listed");
  });
});

describe("SetupWizard", () => {
  it("renders provider, model, and conditional secret fields", () => {
    const html = renderToStaticMarkup(<SetupWizard open models={[{ id: "openai", label: "OpenAI", short: "OpenAI", models: ["gpt-4o-mini"], defaultModel: "gpt-4o-mini", requiresKey: true }]} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(html).toContain("Connect a model");
    expect(html).toContain("API key");
    expect(html).toContain("gpt-4o-mini");
  });
});
