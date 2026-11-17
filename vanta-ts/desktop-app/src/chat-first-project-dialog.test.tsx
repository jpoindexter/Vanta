import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatProjectDialog, projectTaskDraft } from "./chat-first-project-dialog.js";

describe("separate project task setup", () => {
  it("starts with the configured local context and asks for bounded work", () => {
    expect(projectTaskDraft("/proof", "local-model")).toMatchObject({ folder: "/proof", model: "local-model", host: "Local Mac", approvals: true, worktree: true });
  });
  it("requires a native folder choice and does not claim submission runs the agent", () => {
    const markup = renderToStaticMarkup(<ChatProjectDialog open root="/proof" model="local-model" onClose={() => {}} onCreate={async () => {}} />);
    expect(markup).toContain("Nothing runs until you send the draft.");
    expect(markup).toContain('aria-label="Choose project folder"');
    expect(markup).toContain("Create draft");
    expect(markup).not.toContain("Create and run");
  });
  it("is absent from New chat until explicitly opened", () => {
    expect(renderToStaticMarkup(<ChatProjectDialog open={false} onClose={() => {}} onCreate={async () => {}} />)).toBe("");
  });
});
