import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectView, MessagingView } from "./operator-views.js";

const platforms = [
  { id: "telegram", label: "Telegram", status: "ready" as const, configured: true, missing: [], setupSteps: ["Save a bot token."], accessMode: "pairing" as const, allowedCount: 0, fields: [{ key: "TOKEN", label: "Token", secret: true, required: true }] },
  { id: "teams", label: "Teams", status: "needs_setup" as const, configured: false, missing: ["APP_ID"], setupSteps: ["Create an app."], fields: [{ key: "APP_ID", label: "App id", secret: false, required: true }] },
];

const startGateway = async () => ({ state: "live" as const, message: "Gateway is live." });

describe("ConnectView", () => {
  it("shows outcome states and provider test action without exposing credentials", () => {
    const releaseProofs = { commit: "a".repeat(40), ready: false, accounts: [
      { id: "codex" as const, label: "OpenAI Codex via ChatGPT", kind: "model_provider", requiredAction: "completion", stage: "release_proven" as const },
      { id: "google-workspace" as const, label: "Google Workspace", kind: "data_provider", requiredAction: "search", stage: "tested" as const },
      { id: "telegram" as const, label: "Telegram", kind: "messaging_channel", requiredAction: "reply", stage: "configured" as const },
    ] };
    const html = renderToStaticMarkup(<ConnectView capabilities={[]} platforms={platforms} models={[]} status={{ kernel: "online", model: "gpt-5.5", provider: "openai", tools: 1, sessionId: "s1", goals: [] }} releaseProofs={releaseProofs} onSaveMessaging={async () => undefined} onTest={async () => ({ status: "ready", message: "ready" })} onStartGateway={startGateway} onOpenModel={() => undefined} onOpenSetup={() => undefined} />);
    expect(html).toContain("Ready");
    expect(html).toContain("Needs setup");
    expect(html).toContain("Test model");
    expect(html).toContain("Release proven");
    expect(html).toContain("Tested");
    expect(html).toContain("Configured");
    expect(html).not.toContain("Paste credential");
  });

  it("keeps messaging secrets empty and enables testing only for ready adapters", () => {
    const html = renderToStaticMarkup(<MessagingView platforms={platforms} onSave={async () => undefined} onTest={async () => ({ status: "ready", message: "ready" })} onStartGateway={startGateway} />);
    expect(html).toContain('type="password"');
    expect(html).toContain("Test bot");
    expect(html).toContain("Pair new chats");
    expect(html).not.toContain("secret-token");
  });

  it("labels absent provider and adapter catalogs as unavailable", () => {
    const html = renderToStaticMarkup(<ConnectView capabilities={[]} platforms={[]} models={[]} status={null} onSaveMessaging={async () => undefined} onTest={async () => ({ status: "unavailable", message: "unavailable" })} onStartGateway={startGateway} onOpenModel={() => undefined} onOpenSetup={() => undefined} />);
    expect(html).toContain("Unavailable");
    expect(html).toContain("Retry locally before opening setup");
  });

  it("opens directly to the selected messaging adapter", () => {
    const html = renderToStaticMarkup(<ConnectView capabilities={[]} platforms={platforms} models={[]} status={null} initialSection="messaging" messagingId="telegram" onSaveMessaging={async () => undefined} onTest={async () => ({ status: "ready", message: "ready" })} onStartGateway={startGateway} onOpenModel={() => undefined} onOpenSetup={() => undefined} />);
    expect(html).toContain("Messaging platforms");
    expect(html).toContain("Replace saved credentials");
    expect(html).toContain("Telegram");
  });
});
