import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHANNEL_MAX,
  type SlackChannel,
  activeChannelRef,
  formatChannelSuggestion,
  parseChannelList,
  suggestChannels,
} from "./slack-suggest.js";

function ch(name: string, opts: Partial<SlackChannel> = {}): SlackChannel {
  return { id: opts.id ?? `C-${name}`, name, ...opts };
}

describe("activeChannelRef", () => {
  it("returns the fragment after the last # when the cursor is in a #-token", () => {
    expect(activeChannelRef("ping #gen", 9)).toBe("gen");
  });

  it("returns the text only up to the cursor for a mid-token cursor", () => {
    // "#gen|eral" — cursor after "gen" → completes only what precedes it.
    expect(activeChannelRef("#general", 4)).toBe("gen");
  });

  it("returns '' for a bare # at the cursor (empty fragment)", () => {
    expect(activeChannelRef("hello #", 7)).toBe("");
  });

  it("returns null when there is no # in the input", () => {
    expect(activeChannelRef("hello world", 11)).toBeNull();
  });

  it("returns null when a space separates the last # from the cursor", () => {
    // The #-token ended at the space; the cursor is no longer inside it.
    expect(activeChannelRef("#general now", 12)).toBeNull();
  });

  it("uses the LAST # when several are present", () => {
    expect(activeChannelRef("#one and #tw", 12)).toBe("tw");
  });

  it("clamps an over/underflowing cursor instead of throwing", () => {
    expect(activeChannelRef("#gen", 999)).toBe("gen");
    expect(activeChannelRef("#gen", -5)).toBeNull(); // clamped to 0 → before "#"
  });
});

describe("suggestChannels", () => {
  const channels: SlackChannel[] = [
    ch("general", { isMember: true }),
    ch("genie", { isMember: false }),
    ch("design-general", { isMember: true }),
    ch("random", { isMember: true }),
  ];

  it("ranks a name-prefix match above a substring match", () => {
    const out = suggestChannels("gen", channels);
    // "general"/"genie" prefix-match "gen"; "design-general" only substring-matches.
    const names = out.map((c) => c.name);
    expect(names.indexOf("general")).toBeLessThan(names.indexOf("design-general"));
    expect(names.indexOf("genie")).toBeLessThan(names.indexOf("design-general"));
    expect(names).toContain("design-general");
  });

  it("ranks a member channel above a non-member within the same tier", () => {
    // "general" (member) and "genie" (non-member) both prefix-match "gen".
    const out = suggestChannels("gen", channels);
    const names = out.map((c) => c.name);
    expect(names.indexOf("general")).toBeLessThan(names.indexOf("genie"));
  });

  it("drops archived channels", () => {
    const withArchived = [...channels, ch("genocide-archive", { isArchived: true, isMember: true })];
    const out = suggestChannels("gen", withArchived);
    expect(out.map((c) => c.name)).not.toContain("genocide-archive");
  });

  it("dedupes channels sharing an id (first occurrence wins)", () => {
    const dupes: SlackChannel[] = [
      ch("general", { id: "C1", isMember: true }),
      ch("general-clone", { id: "C1", isMember: true }), // same id → dropped
    ];
    const out = suggestChannels("gen", dupes);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe("general");
  });

  it("caps results at max (default 10)", () => {
    const many: SlackChannel[] = Array.from({ length: 25 }, (_, i) =>
      ch(`general-${String(i).padStart(2, "0")}`, { id: `C${i}`, isMember: true }),
    );
    expect(suggestChannels("general", many)).toHaveLength(DEFAULT_CHANNEL_MAX);
    expect(suggestChannels("general", many, 3)).toHaveLength(3);
  });

  it("returns the first N MEMBER channels for an empty fragment", () => {
    const out = suggestChannels("", channels, 2);
    // Empty fragment → member channels only, in list order, capped.
    expect(out.map((c) => c.name)).toEqual(["general", "design-general"]);
  });

  it("treats a whitespace-only fragment as empty", () => {
    const out = suggestChannels("   ", channels);
    expect(out.every((c) => c.isMember === true)).toBe(true);
  });

  it("returns [] when nothing matches the fragment", () => {
    expect(suggestChannels("zzz-nomatch", channels)).toEqual([]);
  });

  it("matches case-insensitively", () => {
    const out = suggestChannels("GEN", channels);
    expect(out.map((c) => c.name)).toContain("general");
  });

  it("breaks ties on shorter name, then alphabetical", () => {
    const ties: SlackChannel[] = [
      ch("gen-b", { isMember: true }),
      ch("gen-a", { isMember: true }),
      ch("gen", { isMember: true }), // shortest → first
    ];
    expect(suggestChannels("gen", ties).map((c) => c.name)).toEqual(["gen", "gen-a", "gen-b"]);
  });
});

describe("formatChannelSuggestion", () => {
  it("prefixes the name with #", () => {
    expect(formatChannelSuggestion(ch("general"))).toBe("#general");
  });

  it("strips control characters from an external channel name", () => {
    // A crafted name carrying an ESC sequence must not survive into the display string.
    const evil = ch("ev[31mil");
    expect(formatChannelSuggestion(evil)).toBe("#ev[31mil");
  });
});

describe("parseChannelList", () => {
  it("parses a Slack conversations.list body string", () => {
    const body = JSON.stringify({
      channels: [
        { id: "C1", name: "general", is_member: true, is_archived: false },
        { id: "C2", name: "random", is_member: false, is_archived: true },
      ],
    });
    const out = parseChannelList(body);
    expect(out).toEqual([
      { id: "C1", name: "general", isMember: true, isArchived: false },
      { id: "C2", name: "random", isMember: false, isArchived: true },
    ]);
  });

  it("accepts an already-parsed object", () => {
    const out = parseChannelList({ channels: [{ id: "C1", name: "general" }] });
    expect(out).toEqual([{ id: "C1", name: "general", isMember: false, isArchived: false }]);
  });

  it("skips rows missing a string id or name", () => {
    const out = parseChannelList({
      channels: [
        { id: "C1", name: "ok" },
        { name: "no-id" },
        { id: "C3" },
        { id: 42, name: "wrong-type" },
        "not-an-object",
      ],
    });
    expect(out.map((c) => c.name)).toEqual(["ok"]);
  });

  it("returns [] on garbage JSON", () => {
    expect(parseChannelList("{not valid json")).toEqual([]);
  });

  it("returns [] when channels is missing or not an array", () => {
    expect(parseChannelList({})).toEqual([]);
    expect(parseChannelList({ channels: "nope" })).toEqual([]);
  });

  it("returns [] for non-object inputs", () => {
    expect(parseChannelList(null)).toEqual([]);
    expect(parseChannelList(42)).toEqual([]);
    expect(parseChannelList([{ id: "C1", name: "general" }])).toEqual([]);
  });
});

describe("pure-slice round-trip (parse → suggest → format)", () => {
  it("powers a #-completion end to end", () => {
    const body = JSON.stringify({
      channels: [
        { id: "C1", name: "general", is_member: true },
        { id: "C2", name: "engineering", is_member: true },
        { id: "C3", name: "general-banter", is_member: false },
        { id: "C4", name: "old-general", is_member: true, is_archived: true },
      ],
    });
    const channels = parseChannelList(body);
    const fragment = activeChannelRef("post in #gen", 12);
    expect(fragment).toBe("gen");

    const ranked = suggestChannels(fragment!, channels);
    // archived "old-general" dropped; member "general" (prefix) first; non-member
    // "general-banter" (substring) ranks below.
    expect(ranked.map(formatChannelSuggestion)).toEqual(["#general", "#general-banter"]);
  });
});
