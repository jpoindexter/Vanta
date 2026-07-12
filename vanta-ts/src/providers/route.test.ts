import { describe, expect, it } from "vitest";
import { normalizeBaseRoute } from "./route.js";

describe("normalizeBaseRoute", () => {
  it("removes credentials, query secrets, fragments, and trailing slashes", () => {
    expect(normalizeBaseRoute("https://user:secret@api.example.com/v1/?api_key=secret#x"))
      .toBe("https://api.example.com/v1");
  });

  it("preserves normalized subscription identities", () => {
    expect(normalizeBaseRoute("subscription://openai-codex/"))
      .toBe("subscription://openai-codex");
  });
});
