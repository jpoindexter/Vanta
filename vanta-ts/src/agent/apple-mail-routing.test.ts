import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConversation } from "../agent.js";
import type { CompletionResult, LLMProvider } from "../providers/interface.js";
import type { SafetyClient } from "../safety-client.js";
import { buildAppleMailAuditTool } from "../tools/apple-mail.js";
import { ToolRegistry } from "../tools/registry.js";

describe("Apple Mail agent routing", () => {
  it("executes the audit inside a Vanta conversation turn", async () => {
    const root = await mkdtemp(join(tmpdir(), "vanta-apple-mail-routing-"));
    const registry = new ToolRegistry();
    registry.register(buildAppleMailAuditTool({
      discoverIndex: async () => "/private/Envelope Index",
      queryIndex: async () => [{
        messageId: 1,
        receivedAt: "2026-08-15 09:30:00",
        senderName: "Recruiting",
        senderAddress: "recruiter@example.test",
        subject: "Application status update",
        summary: "We received your application.",
      }],
    }));
    let providerCalls = 0;
    const provider: LLMProvider = {
      modelId: () => "fake",
      contextWindow: () => 100_000,
      async complete(messages, tools): Promise<CompletionResult> {
        providerCalls += 1;
        expect(tools.map((tool) => tool.name)).toContain("apple_mail_audit");
        if (providerCalls === 1) {
          return {
            text: "",
            finishReason: "tool_calls",
            toolCalls: [{
              id: "apple-mail-1",
              name: "apple_mail_audit",
              arguments: { mode: "signals", since: "2024-01-01" },
            }],
          };
        }
        const toolMessage = messages.find((message) => message.role === "tool");
        expect(toolMessage?.content).toContain('"matches":1');
        return { text: "Vanta found one application signal.", toolCalls: [], finishReason: "stop" };
      },
    };
    const safety = {
      assess: async () => ({ risk: "allow" as const, needsHuman: false, reason: "read-only" }),
      logEvent: async () => {},
    } as unknown as SafetyClient;
    const conversation = createConversation("system", {
      provider,
      safety,
      registry,
      root,
      requestApproval: async () => true,
    });

    try {
      const result = await conversation.send("Audit Apple Mail for job application replies.");
      expect(result.finalText).toBe("Vanta found one application signal.");
      expect(providerCalls).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
