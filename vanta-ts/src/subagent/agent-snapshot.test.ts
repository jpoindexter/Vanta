import { describe, it, expect } from "vitest";
import {
  buildAgentSnapshot,
  hasSnapshot,
  snapshotDiff,
  applySnapshot,
  type SessionNotes,
  type AgentSnapshot,
} from "./agent-snapshot.js";

const notes = (summary: string, keyFacts?: string[]): SessionNotes =>
  keyFacts === undefined ? { summary } : { summary, keyFacts };

describe("buildAgentSnapshot", () => {
  it("distills the summary plus key facts into ordered additions", () => {
    const snap = buildAgentSnapshot(
      "code-reviewer",
      notes("Prefers small diffs", ["Owner dislikes mocks", "CI runs vitest"]),
    );
    expect(snap.agentName).toBe("code-reviewer");
    expect(snap.additions).toEqual([
      "Prefers small diffs",
      "Owner dislikes mocks",
      "CI runs vitest",
    ]);
    expect(snap.priorCount).toBe(0);
  });

  it("caps additions at three durable notes", () => {
    const snap = buildAgentSnapshot(
      "agent",
      notes("one", ["two", "three", "four", "five"]),
    );
    expect(snap.additions).toEqual(["one", "two", "three"]);
    expect(snap.additions.length).toBe(3);
  });

  it("does NOT re-add a note already present in the prior memory (dedupe)", () => {
    const prior = "Prefers small diffs\nCI runs vitest";
    const snap = buildAgentSnapshot(
      "agent",
      notes("Prefers small diffs", ["New fact: owner is async-first"]),
      prior,
    );
    expect(snap.additions).toEqual(["New fact: owner is async-first"]);
    expect(snap.priorCount).toBe(2);
  });

  it("dedupes case-insensitively against the prior memory", () => {
    const snap = buildAgentSnapshot(
      "agent",
      notes("PREFERS SMALL DIFFS"),
      "prefers small diffs",
    );
    expect(snap.additions).toEqual([]);
  });

  it("collapses duplicate notes within the same session", () => {
    const snap = buildAgentSnapshot("agent", notes("repeat me", ["repeat me", "unique"]));
    expect(snap.additions).toEqual(["repeat me", "unique"]);
  });

  it("control-strips each note (no ANSI / control codes survive)", () => {
    const snap = buildAgentSnapshot("agent", notes("hello\x1b[31mworld\x00", ["a\tb\nc"]));
    expect(snap.additions).toEqual(["hello [31mworld", "a b c"]);
    expect(snap.additions[0]).not.toContain("\x1b");
    expect(snap.additions[0]).not.toContain("\x00");
  });

  it("caps an over-long note to one gist line with an ellipsis", () => {
    const long = "x".repeat(300);
    const snap = buildAgentSnapshot("agent", notes(long));
    expect(snap.additions[0]?.length).toBe(200);
    expect(snap.additions[0]?.endsWith("…")).toBe(true);
  });

  it("returns no additions when nothing durable was revealed (empty input)", () => {
    expect(buildAgentSnapshot("agent", notes("")).additions).toEqual([]);
    expect(buildAgentSnapshot("agent", notes("   \n\t  ")).additions).toEqual([]);
  });

  it("returns no additions when every candidate already exists (no spurious update)", () => {
    const prior = "fact one\nfact two";
    const snap = buildAgentSnapshot("agent", notes("fact one", ["fact two"]), prior);
    expect(snap.additions).toEqual([]);
    expect(hasSnapshot(snap)).toBe(false);
  });

  it("control-strips the agent name", () => {
    expect(buildAgentSnapshot("rev\x1biewer", notes("x")).agentName).toBe("rev iewer");
  });
});

describe("hasSnapshot", () => {
  it("reflects whether there are additions", () => {
    expect(hasSnapshot(buildAgentSnapshot("a", notes("learned x")))).toBe(true);
    expect(hasSnapshot(buildAgentSnapshot("a", notes("")))).toBe(false);
  });
});

describe("snapshotDiff", () => {
  it("reports the added notes and the unchanged prior count", () => {
    const prior = "old one\nold two";
    const snap = buildAgentSnapshot("a", notes("new one"), prior);
    const diff = snapshotDiff(snap, prior);
    expect(diff.added).toEqual(["new one"]);
    expect(diff.unchanged).toBe(2);
  });

  it("reports unchanged:0 against empty prior memory", () => {
    const snap = buildAgentSnapshot("a", notes("new one"));
    expect(snapshotDiff(snap)).toEqual({ added: ["new one"], unchanged: 0 });
  });

  it("an empty snapshot adds nothing and leaves prior notes unchanged", () => {
    const prior = "kept\nkept two";
    const snap = buildAgentSnapshot("a", notes(""), prior);
    expect(snapshotDiff(snap, prior)).toEqual({ added: [], unchanged: 2 });
  });
});

describe("applySnapshot", () => {
  it("appends additions to the prior memory and returns the new text (no write)", () => {
    const prior = "existing note";
    const snap = buildAgentSnapshot("a", notes("new note"), prior);
    expect(applySnapshot(prior, snap)).toBe("existing note\nnew note");
  });

  it("returns just the additions when the prior memory is empty", () => {
    const snap = buildAgentSnapshot("a", notes("first", ["second"]));
    expect(applySnapshot("", snap)).toBe("first\nsecond");
  });

  it("returns the prior text unchanged when there is nothing to add", () => {
    const prior = "unchanged content";
    const snap = buildAgentSnapshot("a", notes(""), prior);
    expect(applySnapshot(prior, snap)).toBe(prior);
  });

  it("trims trailing whitespace before appending so no blank-line gap forms", () => {
    const snap = buildAgentSnapshot("a", notes("added"), "prior\n\n");
    expect(applySnapshot("prior\n\n", snap)).toBe("prior\nadded");
  });

  it("is idempotent: re-deriving a snapshot from the applied memory adds nothing", () => {
    const prior = "base";
    const first = buildAgentSnapshot("a", notes("learned thing"), prior);
    const applied = applySnapshot(prior, first);
    // The teardown re-runs the build against the now-updated memory.
    const second = buildAgentSnapshot("a", notes("learned thing"), applied);
    expect(hasSnapshot(second)).toBe(false);
    expect(applySnapshot(applied, second)).toBe(applied);
  });

  it("a hand-built snapshot whose notes already exist still no-ops via empty additions", () => {
    const prior = "already here";
    const empty: AgentSnapshot = { agentName: "a", additions: [], priorCount: 1 };
    expect(applySnapshot(prior, empty)).toBe(prior);
  });
});
