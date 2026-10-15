import { describe, expect, it } from "vitest";
import { sessionHost, sessionMayAccessUrl } from "./session-host.js";

describe("stored browser session host binding", () => {
  it("binds known channels to their canonical hosts and subdomains", () => {
    expect(sessionHost("linkedin", {})).toBe("linkedin.com");
    expect(sessionMayAccessUrl("linkedin", "https://www.linkedin.com/feed/", {})).toBe(true);
    expect(sessionMayAccessUrl("linkedin", "https://linkedin.com/jobs/", {})).toBe(true);
  });

  it("rejects suffix tricks and unrelated hosts", () => {
    expect(sessionMayAccessUrl("linkedin", "https://linkedin.com.evil.test/", {})).toBe(false);
    expect(sessionMayAccessUrl("linkedin", "https://evil-linkedin.com/", {})).toBe(false);
  });

  it("requires an operator host binding for custom channels", () => {
    expect(sessionMayAccessUrl("fixture", "http://127.0.0.1/private", {})).toBe(false);
    expect(sessionMayAccessUrl(
      "fixture",
      "http://127.0.0.1/private",
      { VANTA_BROWSER_SESSION_HOST_FIXTURE: "127.0.0.1" },
    )).toBe(true);
  });
});
