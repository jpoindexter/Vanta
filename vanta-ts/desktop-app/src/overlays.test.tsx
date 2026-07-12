import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ApprovalOverlay, ModelPicker, SetupWizard } from "./overlays.js";

describe("ApprovalOverlay", () => {
  it("renders dedicated request context and all four decisions", () => {
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
    expect(html).toContain("Always allow");
    expect(html).toContain("Deny");
    expect(html).toContain("Never allow");
  });
});

describe("ModelPicker", () => {
  it("defaults to session scope and exposes an explicit default action", () => {
    const html = renderToStaticMarkup(
      <ModelPicker
        open
        models={[{ id: "ollama", label: "Ollama", short: "Local", models: ["qwen"] }]}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(html).toContain("Models for this session");
    expect(html).toContain("Local · qwen");
    expect(html).toContain("Set as default");
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
