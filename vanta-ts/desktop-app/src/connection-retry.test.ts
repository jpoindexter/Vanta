import { describe, expect, it } from "vitest";
import { connectionRetryDelay, isConnectionFailure } from "./connection-retry.js";

describe("connection retry", () => {
  it("treats fetch network failures as retryable and HTTP errors as final", () => {
    expect(isConnectionFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isConnectionFailure(new Error("net::ERR_CONNECTION_REFUSED"))).toBe(true);
    expect(isConnectionFailure(new Error("OPENAI_API_KEY is not set."))).toBe(false);
    expect(isConnectionFailure("nope")).toBe(false);
  });

  it("backs off 250ms to 4s", () => {
    expect([0, 1, 2, 3, 4, 9].map(connectionRetryDelay)).toEqual([250, 500, 1000, 2000, 4000, 4000]);
  });
});
