import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectView, MessagingView } from "./operator-views.js";

const platforms = [
  { id: "telegram", label: "Telegram", status: "ready" as const, configured: true, missing: [], setupSteps: ["Save a bot token."], fields: [{ key: "TOKEN", label: "Token", secret: true }] },
  { id: "teams", label: "Teams", status: "needs_setup" as const, configured: false, missing: ["APP_ID"], setupSteps: ["Create an app."], fields: [{ key: "APP_ID", label: "App id", secret: false }] },
];

describe("ConnectView", () => {
  it("shows outcome states and provider test action without exposing credentials", () => {
    const html = renderToStaticMarkup(<ConnectView capabilities={[]} platforms={platforms} models={[]} status={{ kernel: "online", model: "gpt-5.5", provider: "openai", tools: 1, sessionId: "s1", goals: [] }} onSaveMessaging={async () => undefined} onTest={async () => ({ status: "ready", message: "ready" })} onOpenModel={() => undefined} onOpenSetup={() => undefined} />);
    expect(html).toContain("Ready");
    expect(html).toContain("Needs setup");
    expect(html).toContain("Test model");
    expect(html).not.toContain("Paste credential");
  });

  it("keeps messaging secrets empty and enables testing only for ready adapters", () => {
    const html = renderToStaticMarkup(<MessagingView platforms={platforms} onSave={async () => undefined} onTest={async () => ({ status: "ready", message: "ready" })} />);
    expect(html).toContain('type="password"');
    expect(html).toContain("Test setup");
    expect(html).not.toContain("secret-token");
  });

  it("labels absent provider and adapter catalogs as unavailable", () => {
    const html = renderToStaticMarkup(<ConnectView capabilities={[]} platforms={[]} models={[]} status={null} onSaveMessaging={async () => undefined} onTest={async () => ({ status: "unavailable", message: "unavailable" })} onOpenModel={() => undefined} onOpenSetup={() => undefined} />);
    expect(html).toContain("Unavailable");
    expect(html).toContain("Retry locally before opening setup");
  });
});
