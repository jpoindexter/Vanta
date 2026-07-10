import { describe, expect, it } from "vitest";
import { v2exChannel } from "./v2ex.js";

describe("v2ex reach channel", () => {
  it("handles V2EX URLs before generic web", () => {
    expect(v2exChannel.canHandle("https://www.v2ex.com/t/42")).toBe(true);
    expect(v2exChannel.canHandle("https://example.com/t/42")).toBe(false);
  });

  it("reports zero-config public JSON status", async () => {
    await expect(v2exChannel.check({})).resolves.toMatchObject({
      status: "ok",
      activeBackend: "v2ex-public-json",
    });
  });
});
