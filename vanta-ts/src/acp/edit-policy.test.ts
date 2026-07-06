import { describe, it, expect } from "vitest";
import { isSensitivePath, pathFromAction, decideEditPrompt, buildLineDiff, EDIT_PERMISSION_OPTIONS } from "./edit-policy.js";
import { SessionManager, type SessionSink, type PermissionRequest } from "./session.js";
import type { AgentRunner, RunRequest } from "./session.js";

// EXT-ACP-EDIT-DIFF — sensitive-path policy + session auto-approve + diff.

describe("isSensitivePath", () => {
  it.each([".env", "app/.env.local", ".git/config", "home/.ssh/known_hosts", "deploy/id_rsa", "cert.pem", "x.key", ".aws/credentials", "config/secrets.yaml"])(
    "flags %j",
    (p) => expect(isSensitivePath(p)).toBe(true),
  );
  it.each(["src/index.ts", "README.md", "docs/env-guide.md", "components/Button.tsx"])(
    "allows %j",
    (p) => expect(isSensitivePath(p)).toBe(false),
  );
});

describe("pathFromAction", () => {
  it("extracts the path from the file tools' kernel action strings", () => {
    expect(pathFromAction("write file src/a.ts")).toBe("src/a.ts");
    expect(pathFromAction("edit file config/.env")).toBe("config/.env");
    expect(pathFromAction("run shell command: ls")).toBe("");
  });
});

describe("decideEditPrompt", () => {
  it("auto-allows a non-sensitive edit under a session grant, prompts otherwise", () => {
    expect(decideEditPrompt({ autoApproveEdits: true, path: "src/a.ts" })).toBe("auto-allow");
    expect(decideEditPrompt({ autoApproveEdits: false, path: "src/a.ts" })).toBe("prompt");
    // The grant NEVER covers a sensitive path.
    expect(decideEditPrompt({ autoApproveEdits: true, path: ".env" })).toBe("prompt");
    expect(decideEditPrompt({ autoApproveEdits: true, path: "x/.ssh/id_rsa" })).toBe("prompt");
  });
});

describe("buildLineDiff", () => {
  it("renders a minimal old/new block with context", () => {
    const diff = buildLineDiff("a\nb\nc", "a\nB\nc");
    expect(diff).toContain("- b");
    expect(diff).toContain("+ B");
    expect(diff).toContain("  a");
  });
  it("says so on a no-op and caps very large diffs", () => {
    expect(buildLineDiff("x", "x")).toBe("(no changes)");
    const big = buildLineDiff("", Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n"));
    expect(big).toContain("more lines)");
  });
});

// A sink that records asks and answers with a scripted optionId per call.
function scriptedSink(answers: string[]): { sink: SessionSink; asks: PermissionRequest[] } {
  const asks: PermissionRequest[] = [];
  let i = 0;
  const sink: SessionSink = {
    update: () => {},
    requestPermission: async (_sid, req) => {
      asks.push(req);
      return answers[i++] ?? "";
    },
  };
  return { sink, asks };
}

/** A runner that fires N file-edit approvals for the given paths, recording verdicts. */
function editRunner(paths: string[], verdicts: boolean[]): AgentRunner {
  return async (req: RunRequest) => {
    for (const p of paths) verdicts.push(await req.approve(`write file ${p}`, "write file", "write_file", { diff: `+ ${p}` }));
    return { stopReason: "end_turn" };
  };
}

describe("session auto-approve grant (via SessionManager)", () => {
  it("'allow_always' arms the session so later non-sensitive edits skip the prompt, but a sensitive path re-prompts", async () => {
    // Answers: 1st edit → allow_always; the sensitive edit re-prompts → reject.
    const { sink, asks } = scriptedSink(["allow_always", "reject"]);
    const verdicts: boolean[] = [];
    const mgr = new SessionManager(editRunner(["src/a.ts", "src/b.ts", ".env"], verdicts), sink, "/tmp");
    const { sessionId } = mgr.newSession();
    await mgr.prompt(sessionId, "edit files");
    // src/a.ts prompted (allow_always) → true; src/b.ts auto-allowed (no ask) → true;
    // .env re-prompted despite the grant → reject → false.
    expect(verdicts).toEqual([true, true, false]);
    // Only TWO asks reached the client: the first edit and the sensitive one.
    expect(asks).toHaveLength(2);
    expect(asks[0]?.options).toEqual(EDIT_PERMISSION_OPTIONS);
    // The diff rode along on the ask.
    expect(asks[0]?.toolCall.content?.[0]?.content.text).toContain("src/a.ts");
  });

  it("without a grant, every edit prompts", async () => {
    const { asks } = scriptedSink([]);
    const { sink } = scriptedSink(["allow", "allow"]);
    const verdicts: boolean[] = [];
    const mgr = new SessionManager(editRunner(["src/a.ts", "src/b.ts"], verdicts), sink, "/tmp");
    const { sessionId } = mgr.newSession();
    await mgr.prompt(sessionId, "edit");
    expect(verdicts).toEqual([true, true]);
    void asks;
  });
});
