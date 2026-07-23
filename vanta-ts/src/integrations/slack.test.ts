import { describe, expect, it, vi } from "vitest";
import { testSlack } from "./slack.js";

const response = (value: unknown, status = 200) => ({ ok: status < 300, status, json: async () => value }) as Response;

describe("Slack verification", () => {
  it("uses auth.test with a private bearer token", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => response({ ok: true }));
    await expect(testSlack({ VANTA_SLACK_BOT_TOKEN: "secret", VANTA_SLACK_API_BASE: "https://slack.test" }, fetcher as unknown as typeof fetch)).resolves.toBeUndefined();
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://slack.test/auth.test");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: { authorization: "Bearer secret" } });
  });

  it("reports rejected credentials without echoing the token", async () => {
    await expect(testSlack({ VANTA_SLACK_BOT_TOKEN: "secret" }, vi.fn(async () => response({ ok: false, error: "invalid_auth" }, 200)) as unknown as typeof fetch)).rejects.toThrow("rejected");
  });
});
