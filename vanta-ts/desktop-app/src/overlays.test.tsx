import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ApprovalOverlay, CommandPalette, fastSpeedHint, ModelPicker, NewTaskDialog, SetupWizard } from "./overlays.js";

describe("fastSpeedHint", () => {
  it("uses each provider's own documented fast-tier tradeoff", () => {
    expect(fastSpeedHint("claude-code")).toBe("Up to 2.5× output speed, premium rate");
    expect(fastSpeedHint("anthropic")).toBe("Up to 2.5× output speed, premium rate");
    expect(fastSpeedHint("codex")).toBe("1.5× speed, increased usage");
  });
});

describe("CommandPalette", () => {
  it("exposes Telegram setup when slash opens quick actions", () => {
    const html = renderToStaticMarkup(<CommandPalette open onClose={vi.fn()} onNew={vi.fn()} onReview={vi.fn()} onSidebar={vi.fn()} onCycleMode={vi.fn()} onView={vi.fn()} onModel={vi.fn()} onTelegram={vi.fn()} onSound={vi.fn()} onSettings={vi.fn()} />);
    expect(html).toContain("Set up Telegram");
    expect(html).toContain("Open Review");
    expect(html).toContain("Open Scheduled");
    expect(html).toContain("Open Plugins");
    expect(html).not.toContain(">Terminal<");
  });
});

describe("NewTaskDialog", () => {
  it("uses a native folder chooser entry point and styled menu triggers", () => {
    const html = renderToStaticMarkup(
      <NewTaskDialog
        open
        root="/projects/vanta"
        model="gpt-5"
        onClose={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    expect(html).toContain('id="new-task-folder"');
    expect(html).toContain('value="/projects/vanta"');
    expect(html).toContain("readOnly");
    expect(html).toContain('aria-label="Choose project folder"');
    expect(html).toContain("Choose…");
    expect(html.match(/class="select-control"/g)).toHaveLength(2);
  });
});

describe("ApprovalOverlay", () => {
  it("renders request context and accurately scoped remembered tool choices", () => {
    const html = renderToStaticMarkup(
      <ApprovalOverlay
        approval={{
          id: "a1",
          action: "run shell command: git status --short",
          reason: "kernel ask",
          toolName: "shell_cmd",
          request: {
            kind: "bash",
            canRemember: true,
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
    expect(html).toContain("Always allow this tool");
    expect(html).toContain("Never allow this tool");
    expect(html).toContain("future tasks on this Mac");
    expect(html).toContain('role="dialog"');
  });
  it("keeps exact-action approvals one-time, even if remember eligibility is inconsistent", () => {
    const html = renderToStaticMarkup(<ApprovalOverlay approval={{ id: "fresh", action: "publish exact post", reason: "review", toolName: "linkedin_post", request: { kind: "generic", title: "Publish", subject: "post", reason: "review", sections: [], fresh: true, canRemember: true } }} onAnswer={vi.fn()} />);
    expect(html).not.toContain("Always allow");
    expect(html).not.toContain("Never allow");
    expect(html).toContain("This exact action needs approval each time");
  });
  it("shows a failed decision as an unapproved action with a dismissal, not another allow button", () => {
    const html = renderToStaticMarkup(<ApprovalOverlay approval={{ id: "failed", action: "write", reason: "review", error: "Could not save the approval rule. The action was not approved." }} onAnswer={vi.fn()} />);
    expect(html).toContain("The action was not approved.");
    expect(html).toContain("Dismiss");
    expect(html).not.toContain("Allow once");
  });
});

describe("ModelPicker", () => {
  it("groups models by provider and exposes an explicit default action", () => {
    const html = renderToStaticMarkup(
      <ModelPicker
        open
        models={[{ id: "ollama", label: "Ollama", short: "Local", models: ["qwen"], current: true, savedDefaultModel: "qwen", modelSource: "live", discoveryAvailable: true }]}
        status={null}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
        onSettings={vi.fn()}
      />,
    );
    expect(html).toContain("Choose a model");
    expect(html).toContain("Search models and providers");
    expect(html).toContain("Ollama");
    expect(html).toContain("Live provider catalog");
    expect(html).toContain("Default");
    expect(html).toContain("Ollama qwen is the default");
    expect(html).toContain("Use a model ID that is not listed");
  });

  it("opens compact settings for the selected provider before the full browser", () => {
    const html = renderToStaticMarkup(
      <ModelPicker
        open
        models={[{ id: "codex", label: "OpenAI Codex via ChatGPT subscription", short: "Codex", models: ["gpt-5.6-sol"], modelSource: "live", discoveryAvailable: true, modelSettings: { effort: { defaultValue: "medium", options: ["low", "medium", "high", "xhigh", "max", "ultra"] }, speed: { defaultValue: "standard", options: ["standard", "fast"] } } }]}
        status={{ kernel: "ready", model: "gpt-5.6-sol", provider: "codex", modelSettings: { effortLevel: "high", speed: "standard" }, tools: 1, sessionId: "s1" }}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
        onSettings={vi.fn()}
      />,
    );
    expect(html).toContain("Codex settings");
    expect(html).toContain("Browse providers and models");
    expect(html).toContain("gpt-5.6-sol");
    expect(html).not.toContain("Search models and providers");
    expect(html).not.toContain("Choose a model");
  });

  it("shows only the settings supported by the active provider", () => {
    const codex = renderToStaticMarkup(
      <ModelPicker
        open
        models={[{ id: "codex", label: "Codex", short: "Codex", models: ["gpt-5.6-sol"], modelSource: "live", discoveryAvailable: true, modelSettings: { effort: { defaultValue: "medium", options: ["low", "medium", "high", "xhigh", "max", "ultra"] }, speed: { defaultValue: "standard", options: ["standard", "fast"] } } }]}
        status={{ kernel: "ready", model: "gpt-5.6-sol", provider: "codex", modelSettings: { effortLevel: "high", speed: "fast" }, tools: 1, sessionId: "s1" }}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
        onSettings={vi.fn()}
      />,
    );
    expect(codex).toContain("Effort");
    expect(codex).toContain("Extra High");
    expect(codex).toContain("Ultra");
    expect(codex).toContain("Speed");
    expect(codex).toContain("1.5× speed, increased usage");
    expect(codex).toContain("Save as project defaults");

    const claude = renderToStaticMarkup(
      <ModelPicker
        open
        models={[{ id: "claude-code", label: "Claude Code", short: "Claude", models: ["claude-sonnet-5"], modelSource: "live", discoveryAvailable: true, modelSettings: { effort: { defaultValue: "medium", options: ["low", "medium", "high", "xhigh", "max"] } } }]}
        status={{ kernel: "ready", model: "claude-sonnet-5", provider: "claude-code", modelSettings: { effortLevel: "medium" }, tools: 1, sessionId: "s1" }}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onSelect={vi.fn()}
        onSettings={vi.fn()}
      />,
    );
    expect(claude).toContain("Effort");
    expect(claude).not.toContain("Ultra");
    expect(claude).not.toContain("Speed</span>");
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
