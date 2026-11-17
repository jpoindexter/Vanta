import { describe, it, expect, vi } from "vitest";
import { CodexSearchProvider } from "./codex.js";
const complete = vi.hoisted(() => vi.fn());
vi.mock("../providers/codex.js", () => ({ CodexProvider: class { complete = complete; } }));
vi.mock("../cost/route-ledger.js", () => ({ recordProviderCall: vi.fn() }));

describe("CodexSearchProvider", () => {
  it("rejects generated answers without executed native search evidence", async () => {
    complete.mockResolvedValue({ text: "[invented](https://example.com)" });
    await expect(new CodexSearchProvider().search("query")).rejects.toThrow("no executed native search evidence");
  });
  it("returns only safe, deduplicated provider citations, capped to the requested count", async () => {
    const a = { title: "Exact team", url: "https://example.com/team", snippet: "candidate" };
    complete.mockResolvedValue({ text: "extra https://invented.test", webSearch: { calls: 1, citations: [
      { ...a, url: "javascript:alert(1)" }, a, a, { ...a, url: "https://second.test" },
    ] } });
    expect(await new CodexSearchProvider().search("quoted company", { maxResults: 1 })).toEqual([a]);
    expect(complete.mock.calls.at(-1)?.[0][1].content).toBe("quoted company");
  });
});
