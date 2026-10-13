import { describe, expect, it } from "vitest";
import { liveChatTitle } from "./chat-first-navigation.js";

const user = (content: string) => ({ role: "user" as const, content });

describe("liveChatTitle", () => {
  it("keeps New chat while there is no prompt", () => {
    expect(liveChatTitle("New session", [])).toBe("New chat");
  });

  it("uses the first prompt, collapsed to one line, before the store has named the chat", () => {
    expect(liveChatTitle("New session", [user("Compare note apps\n and save a brief")])).toBe("Compare note apps and save a brief");
  });

  it("truncates a long first prompt with an ellipsis", () => {
    const title = liveChatTitle("", [user("Research the best way to monitor competitor pricing across five regions every week")]);
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title.endsWith("…")).toBe(true);
  });

  it("never overrides a title the user or store already set", () => {
    expect(liveChatTitle("Q3 plan", [user("something else")])).toBe("Q3 plan");
  });
});
