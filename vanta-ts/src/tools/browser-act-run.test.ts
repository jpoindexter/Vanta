import { describe, expect, it, vi } from "vitest";
import { runActions } from "./browser-act-run.js";
import { acquirePage } from "../browser/launch.js";

vi.mock("../browser/launch.js", () => ({ acquirePage: vi.fn() }));

describe("runActions stored session", () => {
  it("injects cookies before navigating and never returns their values", async () => {
    const order: string[] = [];
    const addCookies = vi.fn(async () => { order.push("cookie"); });
    const page = {
      context: () => ({ addCookies }),
      goto: vi.fn(async () => { order.push("navigate"); }),
      click: vi.fn(),
      fill: vi.fn(),
      keyboard: { press: vi.fn() },
      waitForTimeout: vi.fn(),
      evaluate: vi.fn(),
      innerText: vi.fn(async () => "authenticated fixture"),
      $$eval: vi.fn(),
    };
    vi.mocked(acquirePage).mockResolvedValue({
      page,
      close: vi.fn(async () => undefined),
    });

    const result = await runActions(
      {} as typeof import("playwright-core").chromium,
      {},
      [{ type: "navigate", url: "https://example.com/private" }],
      false,
      { cookie: "session=do-not-return", url: "https://example.com/private" },
    );

    expect(result).toEqual({ ok: true, output: "authenticated fixture" });
    expect(order).toEqual(["cookie", "navigate"]);
    expect(addCookies).toHaveBeenCalledWith([
      { name: "session", value: "do-not-return", url: "https://example.com" },
    ]);
    expect(result.output).not.toContain("do-not-return");
  });
});
