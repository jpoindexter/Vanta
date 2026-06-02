import { describe, it, expect } from "vitest";
import { markVolatile, pruneVolatileSkills, VOLATILE_PREFIX } from "./volatile.js";
import { parseSkill, serializeSkill } from "./frontmatter.js";
import type { Message } from "../types.js";

describe("volatile skills", () => {
  it("frontmatter round-trips the volatile flag", () => {
    const md = serializeSkill({ meta: { name: "x", description: "d", created: "c", updated: "u", tags: ["a"], volatile: true }, body: "body" });
    expect(md).toContain("volatile: true");
    expect(parseSkill(md).meta.volatile).toBe(true);
    // non-volatile skills don't emit the flag
    expect(serializeSkill({ meta: { name: "y", description: "d", created: "c", updated: "u", tags: [] }, body: "b" })).not.toContain("volatile");
  });

  it("pruneVolatileSkills drops the body but keeps a stub", () => {
    const messages: Message[] = [
      { role: "user", content: "hi" },
      { role: "tool", toolCallId: "1", name: "recall", content: markVolatile("cron", "HUGE BODY ".repeat(50)) },
      { role: "tool", toolCallId: "2", name: "recall", content: "# normal\nkept" },
    ];
    pruneVolatileSkills(messages);
    expect(messages[1]!.content).toBe(`${VOLATILE_PREFIX}cron⟧ (body dropped after use to save context)`);
    expect(messages[1]!.content).not.toContain("HUGE BODY");
    expect(messages[2]!.content).toContain("kept"); // non-volatile untouched
  });
});
