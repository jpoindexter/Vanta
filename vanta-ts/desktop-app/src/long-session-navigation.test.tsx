import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isNearBottom, LatestButton, PromptMarkers, selectPromptMarkers } from "./long-session-navigation.js";

describe("desktop long-session navigation", () => {
  it("detects the latest edge without snapping a detached reader", () => {
    expect(isNearBottom(1000, 568, 400)).toBe(true);
    expect(isNearBottom(1000, 400, 400)).toBe(false);
  });

  it("keeps a stable, bounded prompt map for a 500-turn fixture", () => {
    const messages = Array.from({ length: 500 }, (_, index) => ({ role: "user", content: `Prompt ${index + 1}` }));
    const markers = selectPromptMarkers(messages);
    expect(markers).toHaveLength(32);
    expect(markers[0]).toEqual({ index: 0, label: "Prompt 1" });
    expect(markers.at(-1)).toEqual({ index: 499, label: "Prompt 500" });
  });

  it("renders a focusable preview for every prompt marker", () => {
    const markers = renderToStaticMarkup(<PromptMarkers messages={[{ role: "user", content: "Review the roadmap" }]} onJump={() => undefined} />);
    expect(markers).toContain('aria-label="Session prompts"');
    expect(markers).toContain('aria-label="Jump to prompt: Review the roadmap"');
    expect(markers).toContain('aria-describedby="prompt-marker-preview-0"');
    expect(markers).toContain('id="prompt-marker-preview-0"');
    expect(markers).toContain('role="tooltip"');
    expect(markers).toContain("Prompt 1 of 1");
    expect(markers).toContain("Review the roadmap");
  });

  it("only renders Latest while detached", () => {
    expect(renderToStaticMarkup(<LatestButton visible={false} streaming={false} onClick={() => undefined} />)).toBe("");
    expect(renderToStaticMarkup(<LatestButton visible streaming onClick={() => undefined} />)).toContain("New messages");
  });
});
