import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TaskDossier, taskDossierState } from "./task-dossier.js";

const base = { title: "Ship the desktop proof", hasMessages: true, busy: false, streaming: false, approval: null, recovery: null, queueCount: 0 };

describe("TaskDossier", () => {
  it("puts an approval ahead of runtime activity", () => {
    const state = taskDossierState({ ...base, busy: true, approval: { id: "a1", action: "post", reason: "Public effect" } });
    expect(state.statusLabel).toBe("Approval needed");
    expect(state.nextAction).toContain("allow it once or reject it");
  });

  it("names a literal provider recovery action", () => {
    const state = taskDossierState({ ...base, recovery: { status: "failed", failureKind: "provider_auth", actions: [] } });
    expect(state.statusLabel).toBe("Needs attention");
    expect(state.nextAction).toContain("Reconnect the selected model");
  });

  it("keeps queued work visible while Vanta works", () => {
    const html = renderToStaticMarkup(<TaskDossier {...base} busy queueCount={2} />);
    expect(html).toContain("In progress");
    expect(html).toContain("2 messages are queued");
    expect(html).toContain("Ship the desktop proof");
  });

  it("gives a first-use next action without invented progress", () => {
    const state = taskDossierState({ ...base, title: "New session", hasMessages: false });
    expect(state.statusLabel).toBe("Ready to start");
    expect(state.outcome).toBe("Name the outcome you want Vanta to deliver.");
    expect(state.nextAction).toBe("Describe the outcome in the composer below.");
  });
});
