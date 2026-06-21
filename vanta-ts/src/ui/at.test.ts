import { describe, it, expect } from "vitest";
import {
  matchAtFiles,
  completeAtRef,
  activeAtRef,
  slackCompletionFor,
  channelSuggestionLabels,
  completeChannelRef,
} from "./at.js";
import type { SlackChannel } from "../repl/slack-suggest.js";

const FILES = ["src/app.ts", "src/composer.tsx", "docs/readme.md"];

const CHANNELS: SlackChannel[] = [
  { id: "C1", name: "general", isMember: true },
  { id: "C2", name: "genie", isMember: false },
  { id: "C3", name: "random", isMember: true },
];

describe("matchAtFiles", () => {
  it("filters by substring (case-insensitive)", () => {
    expect(matchAtFiles(FILES, "comp")).toEqual(["src/composer.tsx"]);
    expect(matchAtFiles(FILES, "SRC")).toEqual(["src/app.ts", "src/composer.tsx"]);
  });
  it("returns the head of the list for an empty partial, capped", () => {
    expect(matchAtFiles(FILES, "")).toEqual(FILES);
    expect(matchAtFiles(Array.from({ length: 20 }, (_, i) => `f${i}`), "f").length).toBe(8);
  });
});

describe("completeAtRef", () => {
  it("replaces the trailing @partial with the selected file", () => {
    expect(completeAtRef("tell me about @comp", ["src/composer.tsx"], 0)).toBe("tell me about @src/composer.tsx");
  });
  it("fills a bare @ with the first match", () => {
    expect(completeAtRef("look @", FILES, 0)).toBe("look @src/app.ts");
  });
});

describe("activeAtRef (re-exported)", () => {
  it("reads the partial after the last @", () => {
    expect(activeAtRef("about @src/ap")).toBe("src/ap");
    expect(activeAtRef("no mention here")).toBeNull();
  });
});

describe("slackCompletionFor — the #channel composer path", () => {
  it("returns ranked channels for the #-token under the cursor", () => {
    const out = slackCompletionFor("post in #gen", 12, CHANNELS);
    // "general" (member) + "genie" both prefix-match "gen"; member ranks first.
    expect(out.map((c) => c.name)).toEqual(["general", "genie"]);
  });

  it("returns [] when the cursor is not inside a #-token (no palette)", () => {
    expect(slackCompletionFor("no channel here", 15, CHANNELS)).toEqual([]);
  });

  it("returns member channels for a bare # (empty fragment)", () => {
    const out = slackCompletionFor("ping #", 6, CHANNELS);
    expect(out.map((c) => c.name)).toEqual(["general", "random"]);
  });

  it("tolerates an empty channel corpus", () => {
    expect(slackCompletionFor("#gen", 4, [])).toEqual([]);
  });
});

describe("channelSuggestionLabels", () => {
  it("renders #-prefixed control-stripped labels", () => {
    expect(channelSuggestionLabels(CHANNELS)).toEqual(["#general", "#genie", "#random"]);
  });
});

describe("completeChannelRef", () => {
  it("replaces the active #partial at the cursor with the selected channel", () => {
    expect(completeChannelRef("post in #gen", 12, CHANNELS, 0)).toBe("post in #general");
  });

  it("fills a bare # with the first suggestion", () => {
    const subset: SlackChannel[] = [{ id: "C1", name: "general", isMember: true }];
    expect(completeChannelRef("ping #", 6, subset, 0)).toBe("ping #general");
  });

  it("preserves text after the cursor (mid-line completion)", () => {
    // "#gen|eral now" — completing the token before the cursor keeps " now".
    expect(completeChannelRef("#gen now", 4, CHANNELS, 0)).toBe("#general now");
  });

  it("returns the line unchanged when there are no channels", () => {
    expect(completeChannelRef("#gen", 4, [], 0)).toBe("#gen");
  });
});
