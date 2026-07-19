import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageMarkdown, safeMessageHtml } from "./message-markdown.js";

describe("MessageMarkdown", () => {
  it("renders structured assistant output instead of raw markdown tokens", () => {
    const html = renderToStaticMarkup(
      <MessageMarkdown content={"**Verified**\n\n- renderer passed\n- layout passed\n\n`npm test`"} />,
    );

    expect(html).toContain("<strong>Verified</strong>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>renderer passed</li>");
    expect(html).toContain("<code>npm test</code>");
    expect(html).not.toContain("**Verified**");
  });

  it("keeps unsafe model-authored links inert", () => {
    const html = safeMessageHtml("[bad](javascript:alert(1)) [good](https://example.com)");

    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('data-unsafe-link="true"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noreferrer"');
  });

  it("renders streamed and restored exact identifiers byte-for-byte", () => {
    const marker = "VANTA_DESKTOP_LIVE_READ_123 client_secret.json GOOGLE_CLIENT_ID";
    const streamed = renderToStaticMarkup(<MessageMarkdown content={marker} />);
    const restored = safeMessageHtml(marker);

    expect(streamed).toContain(marker);
    expect(restored).toContain(marker);
    expect(streamed).not.toContain("<em>");
    expect(restored).not.toContain("<em>");
  });
});
