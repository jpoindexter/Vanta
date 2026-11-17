import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContinuityView } from "./continuity-view.js";

const snapshot = {
  integrity: "ok" as const,
  diagnostics: [],
  today: [{
    version: 1 as const,
    id: "continuity-1",
    outcome: "Get the revised outline back to Sam",
    source: "local-file:brief.md",
    state: "waiting" as const,
    owner: "operator",
    waitCondition: "Continue when you are ready",
    nextAction: "Email Sam the revised outline",
    resumeContext: "Source verified. Continue with the email.",
    updatedAt: "2026-08-02T12:01:00.000Z",
    recommendation: "Read brief.md and choose the first unfinished action",
    choices: ["do it", "show me", "snooze"] as ["do it", "show me", "snooze"],
    preparedAction: { kind: "read_local_file" as const, target: "brief.md", minutes: 10, reversible: true, preview: "Read brief.md. No project files will change. Result: one exact next action." },
    provenanceMemory: [{ source: "brief.md", sourceId: "brief.md", capturedAt: "2026-08-02T12:00:00.000Z" }],
    followUp: { condition: "When ready" },
    timeCapacityFit: { minutes: 10, capacity: { cognitive: "unknown" as const, attentional: "low" as const, sensory: "unknown" as const, social: "unknown" as const, emotional: "unknown" as const, physical: "unknown" as const, time: "steady" as const } },
    blocker: "Waiting for the operator",
    artifacts: [],
  }],
  inbox: [],
  projects: [{ id: "current", label: "Current project", itemCount: 1 }],
  runs: [],
  approvals: [],
  receipts: [],
  legacy: { reconciledAt: "2026-08-02T12:01:00.000Z", sources: [] },
  operator: {
    version: 1 as const, readOnly: true as const, integrity: "ok" as const,
    observedAt: "2026-08-02T12:01:00.000Z", digest: "a".repeat(64),
    views: { captured: [], now: [], waiting: [], needsYou: [], done: [] },
    sources: [{
      kind: "ticket", path: "/tmp/project/.vanta/tickets.json", readOnly: true as const, status: "ok" as const,
      sourceCount: 1, projectedCount: 1, sourceIds: ["ticket-1"], projectedIds: ["ticket-1"],
      sourceSha256: "b".repeat(64), projectionSha256: "c".repeat(64), issues: [],
    }],
  },
  support: {
    capacity: { cognitive: "unknown" as const, attentional: "low" as const, sensory: "unknown" as const, social: "unknown" as const, emotional: "unknown" as const, physical: "unknown" as const, time: "steady" as const },
    transient: { reviewAt: "2026-08-02T16:00:00.000Z", expiresAt: "2026-08-03T12:00:00.000Z", expired: false },
    quietHours: { enabled: true, start: "22:00", end: "08:00" },
    interruptionBudget: { daily: 2, remaining: 2 },
    interaction: { reducedMotion: true, streaming: false, autoScroll: false },
    refusal: { active: false as const },
  },
  reentry: { itemId: "continuity-1", action: "Email Sam the revised outline" },
};

describe("ContinuityView", () => {
  it("renders one concrete recommendation with literal controls and non-color state", () => {
    const html = renderToStaticMarkup(<ContinuityView snapshot={snapshot} busy={false} onCapture={async () => undefined} onAction={async () => undefined} />);
    expect(html).toContain("Today");
    expect(html).toContain("Inbox");
    expect(html).toContain("Projects");
    expect(html).toContain("Sources");
    expect(html).toContain("Do it");
    expect(html).toContain("Show me");
    expect(html).toContain("Snooze");
    expect(html).toContain("Skip");
    expect(html).toContain("Off");
    expect(html).toContain("Waiting");
    expect(html).toContain("No project files will change");
    expect(html).toContain("Attentional: low");
    expect(html).toContain("Sensory: unknown");
    expect(html).toContain("Pick up here");
    expect(html).toContain("No guilt, no reconstruction");
    expect(html).toContain("continuity-workspace reduced-motion");
    expect(html).toContain("streaming buffered");
    expect(html).toContain("scroll manual");
    expect(html).toContain('aria-live="polite"');
  });

  it("keeps the capture prompt free of required taxonomy", () => {
    const html = renderToStaticMarkup(<ContinuityView snapshot={{ ...snapshot, today: [], reentry: undefined }} busy={false} onCapture={async () => undefined} onAction={async () => undefined} />);
    expect(html).toContain("What do you want off your mind?");
    expect(html).not.toContain("Category");
    expect(html).not.toContain("Priority");
  });

  it("renders current effective capacity without rewriting capture-time history", () => {
    const expired = {
      ...snapshot,
      support: {
        ...snapshot.support,
        capacity: { ...snapshot.support.capacity, attentional: "unknown" as const, time: "unknown" as const },
        transient: { ...snapshot.support.transient, expired: true },
      },
    };
    const html = renderToStaticMarkup(<ContinuityView snapshot={expired} busy={false} onCapture={async () => undefined} onAction={async () => undefined} />);
    expect(html).toContain("Attentional: unknown");
    expect(html).not.toContain("Attentional: low");
    expect(expired.today[0]?.timeCapacityFit.capacity.attentional).toBe("low");
  });
});
