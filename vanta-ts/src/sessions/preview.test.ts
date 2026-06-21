import { describe, it, expect } from "vitest";
import type { Message } from "../types.js";
import {
  buildSessionPreview,
  formatSessionPreview,
  stripControl,
  type PreviewSession,
} from "./preview.js";

const NOW_MS = Date.parse("2026-06-21T12:00:00.000Z");
const isoMinutesAgo = (mins: number): string => new Date(NOW_MS - mins * 60_000).toISOString();

function session(messages: Message[], over: Partial<PreviewSession> = {}): PreviewSession {
  return { title: "Test session", started: isoMinutesAgo(5), messages, ...over };
}

describe("stripControl", () => {
  it("strips ANSI/CSI escape sequences", () => {
    expect(stripControl("\x1b[31mred\x1b[0m text")).toBe("red text");
  });

  it("replaces bare control chars (BEL, backspace, ESC) with spaces", () => {
    expect(stripControl("a\x07b\x08c\x1bd")).toBe("a b c d");
  });

  it("collapses whitespace and trims", () => {
    expect(stripControl("  multi\n\t line  ")).toBe("multi line");
  });

  it("is idempotent on already-clean text", () => {
    expect(stripControl("clean text")).toBe("clean text");
  });
});

describe("buildSessionPreview", () => {
  it("counts turns as the number of user messages", () => {
    const p = buildSessionPreview(
      session([
        { role: "user", content: "one" },
        { role: "assistant", content: "ok" },
        { role: "user", content: "two" },
        { role: "assistant", content: "ok" },
      ]),
      NOW_MS,
    );
    expect(p.turns).toBe(2);
  });

  it("derives ageLabel from started + now via formatMessageTime", () => {
    const p = buildSessionPreview(
      session([{ role: "user", content: "hi" }], { started: isoMinutesAgo(3) }),
      NOW_MS,
    );
    expect(p.ageLabel).toBe("3m ago");
  });

  it("uses the first user message as firstPrompt, control-stripped", () => {
    const p = buildSessionPreview(
      session([
        { role: "system", content: "sys" },
        { role: "user", content: "\x1b[1mfirst\x1b[0m question" },
        { role: "user", content: "second question" },
      ]),
      NOW_MS,
    );
    expect(p.firstPrompt).toBe("first question");
  });

  it("uses the last user/assistant message as lastSnippet, ignoring tool messages", () => {
    const p = buildSessionPreview(
      session([
        { role: "user", content: "q" },
        { role: "assistant", content: "the answer" },
        { role: "tool", toolCallId: "t1", name: "read_file", content: "file body" },
      ]),
      NOW_MS,
    );
    expect(p.lastSnippet).toBe("the answer");
  });

  it("truncates long prompts with an ellipsis", () => {
    const long = "x".repeat(200);
    const p = buildSessionPreview(session([{ role: "user", content: long }]), NOW_MS);
    expect(p.firstPrompt.endsWith("…")).toBe(true);
    expect(p.firstPrompt.length).toBe(80);
  });

  it("flags an empty session (no user/assistant turns)", () => {
    const p = buildSessionPreview(
      session([{ role: "system", content: "sys" }]),
      NOW_MS,
    );
    expect(p.empty).toBe(true);
    expect(p.turns).toBe(0);
    expect(p.firstPrompt).toBe("");
    expect(p.lastSnippet).toBe("");
  });

  it("a session with no messages at all is empty", () => {
    const p = buildSessionPreview(session([]), NOW_MS);
    expect(p.empty).toBe(true);
  });

  it("clamps an unparseable started to 'just now' rather than NaN", () => {
    const p = buildSessionPreview(
      session([{ role: "user", content: "hi" }], { started: "not-a-date" }),
      NOW_MS,
    );
    expect(p.ageLabel).toBe("just now");
  });

  it("does not read the wall clock — nowMs is injected", () => {
    const past = Date.parse("2026-06-21T11:30:00.000Z"); // 30m before NOW_MS
    const p = buildSessionPreview(
      session([{ role: "user", content: "hi" }], { started: isoMinutesAgo(5) }),
      past, // event (5m before NOW) is in the future relative to this now
    );
    expect(p.ageLabel).toBe("just now");
  });
});

describe("formatSessionPreview", () => {
  it("renders header + first prompt + last exchange when distinct", () => {
    const p = buildSessionPreview(
      session(
        [
          { role: "user", content: "build the thing" },
          { role: "assistant", content: "done, shipped it" },
        ],
        { title: "My work", started: isoMinutesAgo(5) },
      ),
      NOW_MS,
    );
    expect(formatSessionPreview(p)).toBe(
      "▸ My work  · 1 turn · 5m ago\n    build the thing\n    ↳ done, shipped it",
    );
  });

  it("omits the last-exchange line when it equals the first prompt", () => {
    const p = buildSessionPreview(
      session([{ role: "user", content: "only message" }], {
        title: "Solo",
        started: isoMinutesAgo(5),
      }),
      NOW_MS,
    );
    expect(formatSessionPreview(p)).toBe("▸ Solo  · 1 turn · 5m ago\n    only message");
  });

  it("pluralizes turns", () => {
    const p = buildSessionPreview(
      session(
        [
          { role: "user", content: "a" },
          { role: "user", content: "b" },
        ],
        { title: "Multi", started: isoMinutesAgo(5) },
      ),
      NOW_MS,
    );
    expect(formatSessionPreview(p).split("\n")[0]).toBe("▸ Multi  · 2 turns · 5m ago");
  });

  it("renders a minimal line for an empty session", () => {
    const p = buildSessionPreview(
      session([{ role: "system", content: "sys" }], { title: "Blank" }),
      NOW_MS,
    );
    expect(formatSessionPreview(p)).toBe("▸ Blank · (empty)");
  });

  it("never emits raw control sequences from session content", () => {
    const p = buildSessionPreview(
      session([{ role: "user", content: "evil\x1b[2J\x07prompt" }]),
      NOW_MS,
    );
    const rendered = formatSessionPreview(p);
    // Only the structural "\n" between block lines is allowed; no other control char.
    // eslint-disable-next-line no-control-regex
    expect(/[\x00-\x09\x0b-\x1f\x7f]/.test(rendered)).toBe(false);
  });
});
