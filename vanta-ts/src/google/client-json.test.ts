import { describe, it, expect } from "vitest";
import { parseClientJson, publishStateWarning } from "./client-json.js";

describe("parseClientJson", () => {
  it("parses an installed (Desktop app) client JSON", () => {
    const text = JSON.stringify({
      installed: { client_id: "id-123.apps.googleusercontent.com", client_secret: "sec-abc" },
    });

    const result = parseClientJson(text);

    expect(result).toEqual({
      ok: true,
      creds: { clientId: "id-123.apps.googleusercontent.com", clientSecret: "sec-abc" },
    });
  });

  it("parses a web (Web application) client JSON", () => {
    const text = JSON.stringify({
      web: { client_id: "web-id", client_secret: "web-sec", redirect_uris: ["http://x"] },
    });

    const result = parseClientJson(text);

    expect(result).toEqual({
      ok: true,
      creds: { clientId: "web-id", clientSecret: "web-sec" },
    });
  });

  it("returns ok:false with a JSON-parse error for non-JSON text", () => {
    const result = parseClientJson("{not json");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/valid JSON/i);
  });

  it("returns ok:false when neither installed nor web block is present", () => {
    const result = parseClientJson(JSON.stringify({ other: { client_id: "x" } }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/installed.*web/i);
  });

  it("returns ok:false when the credential block lacks client_secret", () => {
    const result = parseClientJson(JSON.stringify({ installed: { client_id: "id-only" } }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Desktop app/i);
  });

  it("does not leak the secret value into the error text on malformed input", () => {
    // A truncated/invalid JSON that still contains a secret-looking token.
    const result = parseClientJson('{"installed":{"client_secret":"SHHH-leaky"');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain("SHHH-leaky");
  });
});

describe("publishStateWarning", () => {
  it("warns about 7-day refresh-token expiry for Testing status", () => {
    const text = publishStateWarning("testing");

    expect(text).toMatch(/Testing status/);
    expect(text).toMatch(/7 days/);
    expect(text).toMatch(/Publish App/);
  });

  it("guides through the unverified-app Advanced -> Continue click-through", () => {
    const text = publishStateWarning("testing");

    expect(text).toMatch(/Advanced/);
    expect(text).toMatch(/unsafe|continue/i);
  });

  it("treats unknown status as Testing (assumes the worst) and warns", () => {
    const text = publishStateWarning("unknown");

    expect(text).toMatch(/7 days/);
    expect(text).toMatch(/Publish App/);
  });

  it("returns empty guidance for a published consent screen", () => {
    expect(publishStateWarning("published")).toBe("");
  });
});
