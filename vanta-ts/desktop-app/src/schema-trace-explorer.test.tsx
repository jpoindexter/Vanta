import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SchemaTraceExplorer, schemaRetryReady } from "./schema-trace-explorer.js";
import type { DesktopSchemaTrace } from "./types.js";

function trace(overrides: Partial<DesktopSchemaTrace> = {}): DesktopSchemaTrace {
  return {
    planId: "plan-42",
    runId: "run-7",
    queue: { status: "running" },
    certification: { certified: true, modelVersion: 4, coverage: "12/12 complete-history transitions" },
    transitions: [{
      id: "run-7:1", sequence: 1, label: "Open settings", actionMode: "simulated", status: "match",
      modelVersion: 4, predicted: "settings open", observed: "settings open",
      backtest: { certified: true, matchedTransitions: 12, totalTransitions: 12, timelineHash: "sha256:abc123" },
    }],
    ...overrides,
  };
}

describe("SchemaTraceExplorer", () => {
  it("keeps the trace optional while exposing prediction, observation, action kind, and backtest evidence", () => {
    const html = renderToStaticMarkup(<SchemaTraceExplorer trace={trace()} />);
    expect(html).toContain("<details class=\"schema-trace-explorer\"");
    expect(html).toContain("Inspect Schema trace");
    expect(html).toContain("simulated · match");
    expect(html).toContain("Predicted");
    expect(html).toContain("settings open");
    expect(html).toContain("Backtest receipt");
    expect(html).toContain("12/12 transitions matched");
  });

  it("shows the stop reason and blocks retry for an uncertified mismatch", () => {
    const mismatch = trace({
      queue: { status: "stopped", reason: "Prediction mismatch; remaining actions discarded." },
      certification: { certified: false, modelVersion: 4, coverage: "Certification invalidated" },
      transitions: [{
        id: "run-7:2", sequence: 2, label: "Prediction mismatch", actionMode: "real", status: "mismatch",
        modelVersion: 4, path: "$.dialog.open", predicted: "true", observed: "false",
      }],
    });
    const html = renderToStaticMarkup(<SchemaTraceExplorer trace={mismatch} />);
    expect(html).toContain("Prediction mismatch; remaining actions discarded.");
    expect(html).toContain("real · mismatch");
    expect(html).toContain("$.dialog.open");
    expect(html).toContain("Retry unlocks after complete-history recertification");
    expect(schemaRetryReady(mismatch)).toBe(false);
  });

  it("shows a model revision and permits retry only for a recertified resumed queue", () => {
    const revised = trace({
      queue: { status: "resumed", reason: "Model v5 recertified; queue may resume." },
      certification: { certified: true, modelVersion: 5, coverage: "13/13 complete-history transitions" },
      transitions: [{
        id: "run-7:2", sequence: 2, label: "Recovered transition", actionMode: "real", status: "revised",
        modelVersion: 5, predicted: "false", observed: "false",
        modelDiff: { fromVersion: 4, toVersion: 5, summary: ["Guard dialog state before advancing"] },
        backtest: { certified: true, matchedTransitions: 13, totalTransitions: 13, timelineHash: "sha256:def456" },
      }],
    });
    const html = renderToStaticMarkup(<SchemaTraceExplorer trace={revised} />);
    expect(html).toContain("Model diff · v4 → v5");
    expect(html).toContain("Guard dialog state before advancing");
    expect(html).toContain("13/13 transitions matched");
    expect(schemaRetryReady(revised)).toBe(true);
  });
});
