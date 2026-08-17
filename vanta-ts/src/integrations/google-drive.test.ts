import { describe, expect, it, vi } from "vitest";
import { testGoogleDrive } from "./google-drive.js";

const response = (status: number) => ({ ok: status < 300, status }) as Response;

describe("Google Drive verification", () => {
  it("uses a bounded metadata-only request without returning Drive content", async () => {
    const fetcher = vi.fn(async (..._args: Parameters<typeof fetch>) => response(200));
    await expect(testGoogleDrive({}, fetcher as unknown as typeof fetch, async () => "token")).resolves.toBeUndefined();
    expect(fetcher.mock.calls[0]?.[0]).toContain("fields=files(id)");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: { authorization: "Bearer token" } });
  });

  it("makes authorization and rate-limit failures actionable", async () => {
    await expect(testGoogleDrive({}, vi.fn(async () => response(403)) as unknown as typeof fetch, async () => "token")).rejects.toThrow("Reconnect Google Workspace");
    await expect(testGoogleDrive({}, vi.fn(async () => response(429)) as unknown as typeof fetch, async () => "token")).rejects.toThrow("rate limit");
  });
});
