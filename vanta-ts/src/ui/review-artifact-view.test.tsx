import { createElement as h } from "react";
import { describe, it, expect } from "vitest";
import { renderUi, tick } from "./test-render.js";
import { ReviewArtifactView } from "./review-artifact-view.js";

describe("ReviewArtifactView", () => {
  it("renders a new artifact's added lines marked + with the path header", async () => {
    const inst = renderUi(
      h(ReviewArtifactView, { path: "notes.md", oldContent: "", newContent: "alpha\nbeta" }),
    );
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("Review artifact · notes.md (new file)");
    expect(frame).toContain("+ alpha");
    expect(frame).toContain("+ beta");
    expect(frame).toContain("+2"); // added count
    inst.unmount();
  });

  it("marks removed lines with - and added lines with + for an edit", async () => {
    const inst = renderUi(
      h(ReviewArtifactView, {
        path: "app.ts",
        oldContent: "alpha\nbeta\ngamma",
        newContent: "alpha\nBETA\ngamma",
      }),
    );
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("(edit)");
    expect(frame).toContain("- beta");
    expect(frame).toContain("+ BETA");
    expect(frame).toContain("alpha"); // context retained
    inst.unmount();
  });

  it("shows both approve and reject affordances", async () => {
    const inst = renderUi(
      h(ReviewArtifactView, { path: "x.md", oldContent: "", newContent: "y" }),
    );
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("Approve & write");
    expect(frame).toContain("Reject");
    inst.unmount();
  });

  it("highlights the reject affordance when it is selected", async () => {
    const inst = renderUi(
      h(ReviewArtifactView, { path: "x.md", oldContent: "", newContent: "y", selected: "reject" }),
    );
    await tick();
    const frame = inst.lastFrame();
    // the ❯ cursor marks the active option; on reject it precedes "Reject"
    expect(frame).toMatch(/❯\s*Reject/);
    inst.unmount();
  });

  it("renders an empty-change notice when old and new match", async () => {
    const inst = renderUi(
      h(ReviewArtifactView, { path: "same.txt", oldContent: "same", newContent: "same" }),
    );
    await tick();
    const frame = inst.lastFrame();
    expect(frame).toContain("no changes");
    inst.unmount();
  });
});
