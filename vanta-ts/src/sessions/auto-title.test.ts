import { describe, it, expect } from "vitest";
import {
  buildTitlePrompt,
  sanitizeTitle,
  generateSessionTitle,
  titleGenEnabled,
  type TitleComplete,
} from "./auto-title.js";
import type { Message } from "../types.js";

const exchange: Message[] = [
  { role: "system", content: "You are Vanta." },
  { role: "user", content: "Help me wire up the auth flow for the API." },
  { role: "assistant", content: "Sure — let's start with the token handler." },
];

describe("titleGenEnabled", () => {
  it("returns true only when VANTA_AUTO_TITLE=1", () => {
    expect(titleGenEnabled({ VANTA_AUTO_TITLE: "1" })).toBe(true);
  });

  it("is off by default (preserves deriveTitle behavior)", () => {
    expect(titleGenEnabled({})).toBe(false);
    expect(titleGenEnabled({ VANTA_AUTO_TITLE: "0" })).toBe(false);
    expect(titleGenEnabled({ VANTA_AUTO_TITLE: "true" })).toBe(false);
  });
});

describe("buildTitlePrompt", () => {
  it("references the user/assistant exchange and asks for a short title", () => {
    const prompt = buildTitlePrompt(exchange);
    expect(prompt).toContain("at most 6 words");
    expect(prompt).toContain("user: Help me wire up the auth flow for the API.");
    expect(prompt).toContain("assistant: Sure — let's start with the token handler.");
  });

  it("drops system messages (scaffolding, not conversation)", () => {
    const prompt = buildTitlePrompt(exchange);
    expect(prompt).not.toContain("You are Vanta.");
  });

  it("only includes the first few turns of the exchange", () => {
    const long: Message[] = [
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
      { role: "user", content: "three" },
      { role: "assistant", content: "four" },
      { role: "user", content: "five-should-be-dropped" },
    ];
    const prompt = buildTitlePrompt(long);
    expect(prompt).toContain("user: one");
    expect(prompt).not.toContain("five-should-be-dropped");
  });

  it("collapses newlines within a message into a single line", () => {
    const prompt = buildTitlePrompt([
      { role: "user", content: "line one\n\nline two" },
    ]);
    expect(prompt).toContain("user: line one line two");
  });
});

describe("sanitizeTitle", () => {
  it("trims surrounding whitespace", () => {
    expect(sanitizeTitle("  Auth flow setup  ", "fb")).toBe("Auth flow setup");
  });

  it("strips surrounding quotes (double, single, backtick)", () => {
    expect(sanitizeTitle('"Auth flow setup"', "fb")).toBe("Auth flow setup");
    expect(sanitizeTitle("'Auth flow setup'", "fb")).toBe("Auth flow setup");
    expect(sanitizeTitle("`Auth flow setup`", "fb")).toBe("Auth flow setup");
  });

  it("collapses newlines into spaces", () => {
    expect(sanitizeTitle("Auth\nflow\nsetup", "fb")).toBe("Auth flow setup");
  });

  it("caps to 60 chars with an ellipsis", () => {
    const long = "a".repeat(80);
    const out = sanitizeTitle(long, "fb");
    expect(out).toHaveLength(60);
    expect(out.endsWith("...")).toBe(true);
  });

  it("keeps a title exactly at the 60-char boundary verbatim", () => {
    const exact = "b".repeat(60);
    expect(sanitizeTitle(exact, "fb")).toBe(exact);
  });

  it("falls back when empty or blank after sanitizing", () => {
    expect(sanitizeTitle("", "the-fallback")).toBe("the-fallback");
    expect(sanitizeTitle("   \n  ", "the-fallback")).toBe("the-fallback");
    expect(sanitizeTitle('""', "the-fallback")).toBe("the-fallback");
  });

  it("is idempotent on already-clean input", () => {
    expect(sanitizeTitle("Auth flow setup", "fb")).toBe("Auth flow setup");
  });
});

describe("generateSessionTitle", () => {
  it("returns the sanitized model title on success", async () => {
    const complete: TitleComplete = async () => '  "Wire up API auth"  ';
    const title = await generateSessionTitle(exchange, {
      complete,
      fallback: "derived",
    });
    expect(title).toBe("Wire up API auth");
  });

  it("passes the built prompt to the injected model call", async () => {
    let seen = "";
    const complete: TitleComplete = async (p) => {
      seen = p;
      return "Auth flow";
    };
    await generateSessionTitle(exchange, { complete, fallback: "derived" });
    expect(seen).toContain("Conversation:");
    expect(seen).toContain("user: Help me wire up the auth flow for the API.");
  });

  it("falls back when the model call returns a blank title", async () => {
    const complete: TitleComplete = async () => "   \n  ";
    const title = await generateSessionTitle(exchange, {
      complete,
      fallback: "derived-title",
    });
    expect(title).toBe("derived-title");
  });

  it("falls back (never throws) when the model call rejects", async () => {
    const complete: TitleComplete = async () => {
      throw new Error("provider unreachable");
    };
    const title = await generateSessionTitle(exchange, {
      complete,
      fallback: "derived-title",
    });
    expect(title).toBe("derived-title");
  });

  it("does not call a real LLM — the dep is fully injected", async () => {
    let calls = 0;
    const complete: TitleComplete = async () => {
      calls += 1;
      return "Counted";
    };
    await generateSessionTitle(exchange, { complete, fallback: "fb" });
    expect(calls).toBe(1);
  });
});
