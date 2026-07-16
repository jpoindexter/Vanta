import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccessModeMenu } from "./access-mode-picker.js";

describe("AccessModeMenu", () => {
  it("renders all three modes and marks the active project setting", () => {
    const html = renderToStaticMarkup(
      <AccessModeMenu mode="full" pending={false} onSelect={() => undefined} onClose={() => undefined} />,
    );
    expect(html).toContain("Ask for approval");
    expect(html).toContain("Approve for me");
    expect(html).toContain("Full access");
    expect(html).toContain("Project setting");
    expect(html).toContain('aria-checked="true"');
  });
});
