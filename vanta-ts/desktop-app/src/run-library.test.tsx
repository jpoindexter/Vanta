import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RunLibraryPanel, type RunLibraryController } from "./run-library.js";
import type { RunRecord } from "./types.js";

const RUN: RunRecord = {
  version: 1,
  id: "run-1",
  sessionId: "session-1",
  turnIndex: 0,
  title: "Successful roadmap review",
  prompt: "Review the roadmap",
  projectRoot: "/project",
  providerId: "openai",
  modelId: "gpt-5.5",
  startedAt: "2026-07-24T10:00:00.000Z",
  completedAt: "2026-07-24T10:01:00.000Z",
  status: "done",
  saved: true,
  tags: [],
  provenance: "captured",
  lineage: { mode: "original" },
  inputs: [{ path: "roadmap.json", capture: "snapshotted" }],
  events: [{ at: "2026-07-24T10:00:10.000Z", kind: "tool_start", toolName: "read_file" }],
  finalOutput: "The roadmap is coherent.",
};

describe("RunLibraryPanel", () => {
  it("renders saved runs with searchable provenance cues", () => {
    const controller: RunLibraryController = {
      runs: [RUN],
      loading: false,
      error: "",
      refresh: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      preview: vi.fn(),
      prepare: vi.fn(),
    };
    const html = renderToStaticMarkup(<RunLibraryPanel controller={controller} onPrepared={vi.fn()} />);
    expect(html).toContain("Successful roadmap review");
    expect(html).toContain("openai");
    expect(html).toContain("1 tools");
    expect(html).toContain("Prompt, file, or tool");
    expect(html).toContain("All runs");
  });
});
