import { describe, expect, it } from "vitest";
import type { Message } from "../types.js";
import { normalizeBaseRoute, withProviderRoute } from "./route.js";

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

describe("withProviderRoute runtime identity", () => {
  it("tells the serving model its authoritative provider and model", async () => {
    let sent: Message[] = [];
    const provider = withProviderRoute(
      {
        complete: async (messages) => {
          sent = messages;
          return { text: "ok", toolCalls: [], finishReason: "stop" };
        },
        modelId: () => "claude-sonnet-5",
        contextWindow: () => 200_000,
      },
      {
        provider: "claude-code",
        baseRoute: "subscription://anthropic-claude-code",
        billingMode: "included",
      },
    );
    const messages: Message[] = [
      { role: "system", content: "You are Vanta." },
      { role: "user", content: "What model are you?" },
    ];

    await provider.complete(messages, []);

    const system = sent.find((message) => message.role === "system")?.content ?? "";
    expect(system).toContain("Active provider: claude-code");
    expect(system).toContain("Active model: claude-sonnet-5");
    expect(system).toContain("answer with these values directly");
    expect(messages[0]?.content).toBe("You are Vanta.");
  });

  it("replaces stale route metadata instead of accumulating identities", async () => {
    const seen: Message[][] = [];
    const makeProvider = (provider: string, model: string) => withProviderRoute(
      {
        complete: async (messages) => {
          seen.push(messages);
          return { text: "ok", toolCalls: [], finishReason: "stop" };
        },
        modelId: () => model,
        contextWindow: () => 200_000,
      },
      {
        provider,
        baseRoute: `provider://${provider}`,
        billingMode: "included",
      },
    );
    const original = makeProvider("codex", "gpt-5.5");
    const switched = makeProvider("claude-code", "claude-sonnet-5");
    const messages: Message[] = [{ role: "system", content: "You are Vanta." }];

    await original.complete(messages, []);
    await switched.complete(seen[0]!, []);

    const system = seen[1]?.find((message) => message.role === "system")?.content ?? "";
    expect(system).toContain("Active provider: claude-code");
    expect(system).not.toContain("Active provider: codex");
    expect(system.match(/<vanta_runtime_route>/g)).toHaveLength(1);
  });
});
