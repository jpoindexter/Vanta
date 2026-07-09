import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

describe("companion entrypoint", () => {
  it("routes /companion to the dedicated mobile surface", async () => {
    vi.stubGlobal("window", { location: { pathname: "/companion", hostname: "phone.local" }, localStorage: { getItem: () => null } });
    vi.stubGlobal("navigator", { userAgent: "iPhone" });
    const { CompanionApp } = await import("./companion.js");
    const html = renderToStaticMarkup(<CompanionApp />);
    expect(html).toContain("Pair this device");
    expect(html).toContain("one-time-code");
    expect(html).not.toContain("Terminal");
    vi.unstubAllGlobals();
  });
});
