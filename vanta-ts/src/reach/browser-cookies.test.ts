import { describe, it, expect } from "vitest";
import { createCipheriv, pbkdf2Sync } from "node:crypto";
import { decryptCookie } from "./browser-cookies.js";

// Encrypt the way Chromium does so we can prove the decrypt round-trips.
const key = pbkdf2Sync("testpw", "saltysalt", 1003, 16, "sha1");

function encrypt(value: string, opts: { prefix?: string; domainHash?: boolean } = {}): string {
  const cipher = createCipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
  const plain = opts.domainHash ? Buffer.concat([Buffer.alloc(32, 0), Buffer.from(value)]) : Buffer.from(value);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  const prefixed = opts.prefix === "" ? body : Buffer.concat([Buffer.from(opts.prefix ?? "v10"), body]);
  return prefixed.toString("hex");
}

describe("decryptCookie", () => {
  it("round-trips a v10-prefixed value", () => {
    expect(decryptCookie(encrypt("auth_token_abc123"), key)).toBe("auth_token_abc123");
  });

  it("strips the 32-byte SHA256(host) prefix newer Chromium prepends", () => {
    expect(decryptCookie(encrypt("ct0value", { domainHash: true }), key)).toBe("ct0value");
  });

  it("handles a value with no v10/v11 prefix", () => {
    expect(decryptCookie(encrypt("plainval", { prefix: "" }), key)).toBe("plainval");
  });

  it("round-trips a long token (multi-block, PKCS7)", () => {
    const tok = "a".repeat(120) + "Z9";
    expect(decryptCookie(encrypt(tok), key)).toBe(tok);
  });
});
