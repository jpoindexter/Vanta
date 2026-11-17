import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LibreChatView } from "./chat-view.js";

const slots = {
  heading: "A saved Vanta conversation",
  landing: <p>Welcome without a task contract</p>,
  messages: <p>Existing canonical transcript</p>,
  composer: <textarea aria-label="Vanta message" defaultValue="Unsent words" />,
};

describe("LibreChat presentation hosted by Vanta", () => {
  it("renders the landing and one host-owned composer without creating a conversation", () => {
    const html = renderToStaticMarkup(<LibreChatView {...slots} isLandingPage />);
    expect(html).toContain("Welcome without a task contract");
    expect(html).not.toContain("Existing canonical transcript");
    expect(html.match(/<textarea/g)).toHaveLength(1);
    expect(html).toContain("Unsent words");
    expect(html).not.toContain('<h1 class="sr-only">');
  });

  it("renders the actual transcript and preserves the same composer slot during a turn", () => {
    const html = renderToStaticMarkup(<LibreChatView {...slots} isLandingPage={false} />);
    expect(html).toContain("Existing canonical transcript");
    expect(html).not.toContain("Welcome without a task contract");
    expect(html.match(/<textarea/g)).toHaveLength(1);
    expect(html.indexOf("Existing canonical transcript")).toBeLessThan(html.indexOf("<textarea"));
  });

  it("keeps a programmatic page heading without inventing activity or approval status", () => {
    const html = renderToStaticMarkup(<LibreChatView {...slots} isLandingPage={false} />);
    expect(html).toContain('<h1 class="sr-only">A saved Vanta conversation</h1>');
    expect(html).not.toContain("verified");
    expect(html).not.toContain("Approved");
  });

  it("ships the full source license notice as a public package asset", () => {
    const source = readFileSync(new URL("./LICENSE", import.meta.url), "utf8");
    const asset = readFileSync(new URL("../../public/third-party/LibreChat-LICENSE.txt", import.meta.url), "utf8");
    expect(asset).toBe(source);
    expect(asset).toContain("Copyright (c) 2026 LibreChat");
  });
});
