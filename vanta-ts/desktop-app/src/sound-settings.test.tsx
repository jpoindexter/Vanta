import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CompletionSoundSettings } from "./sound-settings.js";

describe("CompletionSoundSettings", () => {
  it("renders a labelled mute control and all three selectable cues", () => {
    const html = renderToStaticMarkup(
      <CompletionSoundSettings
        open
        settings={{ enabled: true, sound: "soft" }}
        onChange={vi.fn()}
        onPreview={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("Play after each completed turn");
    expect(html).toContain("Soft");
    expect(html).toContain("Bright");
    expect(html).toContain("Resonant");
    expect(html).toContain("Preview");
  });

  it("disables cue selection and preview while muted", () => {
    const html = renderToStaticMarkup(
      <CompletionSoundSettings
        open
        settings={{ enabled: false, sound: "bright" }}
        onChange={vi.fn()}
        onPreview={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});
