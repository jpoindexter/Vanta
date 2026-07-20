import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkflowRunDetail, type WorkflowRunPacket } from "./workflow-runs.js";

const packet: WorkflowRunPacket = {
  runId: "release-proof",
  graphId: "review-and-rework",
  status: "paused",
  revision: 7,
  updatedAt: "2026-07-20T12:00:00.000Z",
  nodes: [
    { id: "build", type: "agent", status: "ok", attempts: 1 },
    { id: "review", type: "review", status: "denied", attempts: 2 },
  ],
  timeline: [
    { at: "2026-07-20T12:00:00.000Z", kind: "decision", label: "review → build (rework)", replay: "recorded" },
    { at: "2026-07-20T12:01:00.000Z", kind: "approval", label: "publish: denied", replay: "recorded" },
  ],
  artifacts: [{ id: "diff", uri: "artifact://diff", revision: "1" }],
  terminal: { state: "paused", reason: "operator pause requested" },
  controls: ["retry"],
  replayPolicy: "Side effects are never replayed by default.",
};

describe("WorkflowRunDetail", () => {
  it("renders status, review/rework receipt, recovery, and replay boundary", () => {
    const html = renderToStaticMarkup(<WorkflowRunDetail packet={packet} onControl={() => undefined} onExport={() => undefined} />);
    expect(html).toContain("release-proof");
    expect(html).toContain("review → build (rework)");
    expect(html).toContain("publish: denied");
    expect(html).toContain("Retry");
    expect(html).toContain("never replayed by default");
    expect(html).not.toContain("artifact://diff");
  });
});
