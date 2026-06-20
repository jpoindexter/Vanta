import { describe, it, expect } from "vitest";
import { classifyProviderError, errorText } from "./error-taxonomy.js";
import type { ErrorReason } from "./error-taxonomy.js";

// ---------------------------------------------------------------------------
// errorText() — normalization
// ---------------------------------------------------------------------------

describe("errorText()", () => {
  it("returns the message of an Error instance", () => {
    expect(errorText(new Error("boom"))).toBe("boom");
  });

  it("returns a string verbatim", () => {
    expect(errorText("429 too many requests")).toBe("429 too many requests");
  });

  it("folds status/code/message off a provider-shaped object", () => {
    const text = errorText({ status: 429, code: "rate_limit_exceeded", message: "slow down" });
    expect(text).toContain("rate_limit_exceeded");
    expect(text).toContain("429");
    expect(text).toContain("slow down");
  });

  it("recurses into a nested error object", () => {
    const text = errorText({ error: { message: "insufficient_quota", type: "billing" } });
    expect(text).toContain("insufficient_quota");
  });

  it("falls back to String() for primitives without a message", () => {
    expect(errorText(null)).toBe("null");
    expect(errorText(undefined)).toBe("undefined");
    expect(errorText(42)).toBe("42");
  });
});

// ---------------------------------------------------------------------------
// classifyProviderError() — category mapping
// ---------------------------------------------------------------------------

/** Asserts an input classifies to the expected reason. */
function expectReason(input: unknown, reason: ErrorReason): void {
  expect(classifyProviderError(input).reason).toBe(reason);
}

describe("classifyProviderError() — auth", () => {
  it("classifies 401 as permanent auth (rotate, no retry, no fallback)", () => {
    const v = classifyProviderError(new Error("401 Unauthorized"));
    expect(v.reason).toBe("auth_permanent");
    expect(v.retryable).toBe(false);
    expect(v.shouldRotate).toBe(true);
    expect(v.shouldFallback).toBe(false);
  });

  it("classifies an invalid api key as permanent auth", () => {
    expectReason("Incorrect API key provided", "auth_permanent");
  });

  it("classifies 403/407 as permanent auth", () => {
    expectReason(new Error("403 Forbidden"), "auth_permanent");
    expectReason(new Error("407 Proxy Authentication Required"), "auth_permanent");
  });

  it("classifies an expired token as recoverable auth (rotate + retry)", () => {
    const v = classifyProviderError("Your access token has expired, please refresh the token");
    expect(v.reason).toBe("auth");
    expect(v.retryable).toBe(true);
    expect(v.shouldRotate).toBe(true);
  });
});

describe("classifyProviderError() — billing vs rate_limit", () => {
  it("distinguishes billing exhaustion from transient rate_limit", () => {
    const billing = classifyProviderError(
      new Error("You exceeded your current quota, please check your plan and billing details. insufficient_quota"),
    );
    expect(billing.reason).toBe("billing");
    expect(billing.retryable).toBe(false); // retry won't refill quota
    expect(billing.shouldFallback).toBe(true); // a different provider might work

    const rate = classifyProviderError(new Error("429 Too Many Requests: rate limit reached"));
    expect(rate.reason).toBe("rate_limit");
    expect(rate.retryable).toBe(true);
  });

  it("classifies 402 / out-of-credits as billing", () => {
    expectReason("402 Payment Required", "billing");
    expectReason("Your credit balance is too low to access this model", "billing");
  });

  it("classifies a bare 429 as transient rate_limit (no billing keyword)", () => {
    expectReason(new Error("429 too many requests"), "rate_limit");
  });
});

describe("classifyProviderError() — capacity & server", () => {
  it("classifies an overloaded/529 error as overloaded (retry + fallback)", () => {
    const v = classifyProviderError({ status: 529, error: { type: "overloaded_error", message: "Overloaded" } });
    expect(v.reason).toBe("overloaded");
    expect(v.retryable).toBe(true);
    expect(v.shouldFallback).toBe(true);
  });

  it("classifies 5xx as server_error (retry + fallback)", () => {
    expectReason("503 Service Unavailable", "server_error");
    expectReason("502 Bad Gateway", "server_error");
    expectReason("Internal Server Error", "server_error");
  });
});

describe("classifyProviderError() — timeout & network", () => {
  it("classifies a timeout (retry + fallback, no compress)", () => {
    const v = classifyProviderError(new Error("ETIMEDOUT: request timed out"));
    expect(v.reason).toBe("timeout");
    expect(v.retryable).toBe(true);
    expect(v.shouldCompress).toBe(false);
  });

  it("classifies connection-level failures as network", () => {
    expectReason(new Error("ECONNRESET"), "network");
    expectReason(new Error("fetch failed"), "network");
    expectReason(new Error("getaddrinfo ENOTFOUND api.openai.com"), "network");
  });
});

describe("classifyProviderError() — size limits trigger compression", () => {
  it("classifies context-window overflow (compress + retry, no fallback)", () => {
    const v = classifyProviderError(
      new Error("This model's maximum context length is 128000 tokens. context_length_exceeded"),
    );
    expect(v.reason).toBe("context_overflow");
    expect(v.shouldCompress).toBe(true);
    expect(v.retryable).toBe(true);
    expect(v.shouldFallback).toBe(false);
  });

  it("classifies a 413 payload as payload_too_large (compress)", () => {
    const v = classifyProviderError("413 Request Entity Too Large");
    expect(v.reason).toBe("payload_too_large");
    expect(v.shouldCompress).toBe(true);
  });

  it("classifies an oversized image without compressing the whole convo", () => {
    const v = classifyProviderError("image exceeds 5 MB maximum size");
    expect(v.reason).toBe("image_too_large");
    expect(v.shouldCompress).toBe(false);
    expect(v.retryable).toBe(false);
  });
});

describe("classifyProviderError() — terminal categories (no recovery)", () => {
  it("classifies a content-policy refusal as non-recoverable", () => {
    const v = classifyProviderError("Your request was rejected by the content policy / safety system");
    expect(v.reason).toBe("content_policy");
    expect(v.retryable).toBe(false);
    expect(v.shouldFallback).toBe(false);
    expect(v.shouldRotate).toBe(false);
  });

  it("classifies an unknown model as model_not_found (fallback, no retry)", () => {
    const v = classifyProviderError("The model `gpt-9` does not exist or you do not have access to it");
    expect(v.reason).toBe("model_not_found");
    expect(v.retryable).toBe(false);
    expect(v.shouldFallback).toBe(true);
  });

  it("classifies a 400 / ENOENT as bad_request (no retry, no fallback)", () => {
    expectReason(new Error("400 Bad Request"), "bad_request");
    expectReason(new Error("ENOENT: file not found"), "bad_request");
  });

  it("classifies a plain 404 as not_found", () => {
    expectReason("404 Not Found", "not_found");
  });
});

describe("classifyProviderError() — unknown fallback", () => {
  it("returns conservative defaults for an unrecognized error", () => {
    const v = classifyProviderError(new Error("something totally novel and unparseable"));
    expect(v.reason).toBe("unknown");
    expect(v.retryable).toBe(false);
    expect(v.shouldCompress).toBe(false);
    expect(v.shouldRotate).toBe(false);
    expect(v.shouldFallback).toBe(false);
  });

  it("returns unknown for null/undefined without throwing", () => {
    expect(classifyProviderError(null).reason).toBe("unknown");
    expect(classifyProviderError(undefined).reason).toBe("unknown");
  });
});

describe("classifyProviderError() — priority ordering", () => {
  it("prefers billing over rate_limit when a 429 also names insufficient_quota", () => {
    expectReason(new Error("429: insufficient_quota — you exceeded your current quota"), "billing");
  });

  it("prefers overloaded over server_error when a 5xx is also overloaded", () => {
    // 529 + "overloaded" must not be misread as a generic server_error.
    expectReason("529 overloaded", "overloaded");
  });
});
