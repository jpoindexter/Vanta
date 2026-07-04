import { describe, it, expect } from "vitest";
import { redactStructural, redactForLog } from "./redact-structural.js";

describe("redactStructural — URL query credentials", () => {
  it("masks a ?token= value but keeps the key and the rest of the URL", () => {
    const out = redactStructural("GET https://api.x.com/v1/data?token=abc123XYZ&page=2");
    expect(out).toBe("GET https://api.x.com/v1/data?token=***&page=2");
  });

  it("masks &api_key=, ?access_token=, and ?password= values", () => {
    expect(redactStructural("https://h/x?api_key=SEKRET")).toBe("https://h/x?api_key=***");
    expect(redactStructural("https://h/x?foo=1&access_token=eyJraeaa")).toBe("https://h/x?foo=1&access_token=***");
    expect(redactStructural("https://h/login?password=hunter2")).toBe("https://h/login?password=***");
  });

  it("leaves non-secret query params untouched", () => {
    const url = "https://h/search?q=cats&page=2&sort=asc";
    expect(redactStructural(url)).toBe(url);
  });
});

describe("redactStructural — auth headers", () => {
  it("masks an Authorization header value", () => {
    expect(redactStructural("Authorization: Bearer eyJhbGciOi.abc.def")).toBe("Authorization: ***");
  });

  it("masks X-Api-Key and Cookie header values", () => {
    expect(redactStructural("X-Api-Key: live_sk_9f8a7b")).toBe("X-Api-Key: ***");
    expect(redactStructural("Cookie: session=deadbeef; other=1")).toBe("Cookie: ***");
  });

  it("only masks to end of line — a following line is preserved", () => {
    const out = redactStructural("authorization: Basic Zm9v\nstatus: 200 OK");
    expect(out).toBe("authorization: ***\nstatus: 200 OK");
  });
});

describe("redactStructural — connection strings", () => {
  it("masks the password between user: and @host, keeping user and host", () => {
    expect(redactStructural("postgres://admin:s3cr3t@db.internal:5432/app")).toBe(
      "postgres://admin:***@db.internal:5432/app",
    );
  });

  it("handles mongodb/redis and an empty user", () => {
    expect(redactStructural("mongodb://u:p@h/db")).toBe("mongodb://u:***@h/db");
    expect(redactStructural("redis://:p4ss@h:6379")).toBe("redis://:***@h:6379");
  });

  it("leaves a credential-free URL untouched", () => {
    const u = "https://example.com/path?q=1";
    expect(redactStructural(u)).toBe(u);
  });
});

describe("redactStructural — no false positives", () => {
  it("returns plain prose unchanged", () => {
    const s = "The user updated the config and ran the migration at 10:04.";
    expect(redactStructural(s)).toBe(s);
  });
});

describe("redactForLog — composes structural + vendor-value redaction", () => {
  it("all three done cases in one line are redacted", () => {
    const line =
      "req https://h/x?token=abc | Authorization: Bearer xyz | db postgres://u:pw@h/app";
    const out = redactForLog(line);
    expect(out).not.toContain("token=abc");
    expect(out).not.toContain("Bearer xyz");
    expect(out).not.toContain(":pw@");
    expect(out).toContain("token=***");
  });

  it("still catches a bare vendor secret with no structural slot", () => {
    // A GitHub PAT sitting loose in text — no ?key=/header/conn-string wrapper.
    const out = redactForLog("cloned with ghp_012345678901234567890123456789012345 ok");
    expect(out).not.toContain("ghp_012345678901234567890123456789012345");
    expect(out).toContain("[REDACTED]");
  });
});
