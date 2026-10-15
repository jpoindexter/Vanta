import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccessModeMenu } from "./access-mode-picker.js";

describe("AccessModeMenu", () => {
  it("renders all five modes and marks the active project setting", () => {
    const html = renderToStaticMarkup(
      <AccessModeMenu mode="full" pending={false} onSelect={() => undefined} onClose={() => undefined} />,
    );
    expect(html).toContain("Manual mode");
    expect(html).toContain("Accept edits");
    expect(html).toContain("Plan mode");
    expect(html).toContain("Auto mode");
    expect(html).toContain("Full access");
    expect(html).toContain("Project setting");
    expect(html).toContain('aria-checked="true"');
  });
});
