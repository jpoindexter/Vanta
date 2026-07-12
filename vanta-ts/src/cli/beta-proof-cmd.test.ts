import { describe, expect, it } from "vitest";
import { assessTaskProof } from "./beta-proof-cmd.js";
import type { Message } from "../types.js";

describe("assessTaskProof", () => {
  const messages: Message[] = [
    { role: "system", content: "system" },
    { role: "tool", toolCallId: "read-1", name: "read_file", content: "# Vanta\nbody" },
  ];

  it("requires the real read result, output contract, and a normal stop", () => {
    expect(assessTaskProof("VANTA_BETA_TASK_OK\n# Vanta", messages, 2, "done").ok).toBe(true);
    expect(assessTaskProof("VANTA_BETA_TASK_OK\n# Vanta", [], 1, "done").ok).toBe(false);
    expect(assessTaskProof("VANTA_BETA_TASK_OK", messages, 2, "done").ok).toBe(false);
    expect(assessTaskProof("VANTA_BETA_TASK_OK\n# Vanta", messages, 8, "max_iterations").ok).toBe(false);
  });
});
