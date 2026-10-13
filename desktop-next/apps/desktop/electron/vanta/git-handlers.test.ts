import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NeedsApprovalError, gitApi } from "./bridge-native";
import { fakeIpc } from "./bridge-test-helpers";
import { CH } from "./channels";
import { NEEDS_APPROVAL_MESSAGE, registerGitHandlers } from "./git-handlers";
import { createGitRunner } from "./git-runner";
import type { IpcLike } from "./native-handlers";
import { git, initRepo, makeSandbox, type Sandbox, write } from "./project-test-helpers";

let box: Sandbox;
let call: (channel: string, ...args: unknown[]) => Promise<unknown>;
let handlers: Map<string, (event: { sender: unknown }, ...args: unknown[]) => unknown>;

beforeEach(() => {
  box = makeSandbox();
  initRepo(box.root);
  handlers = new Map();
  const ipc = { handle: (channel, fn) => handlers.set(channel, fn as never), on: () => undefined } as IpcLike;
  registerGitHandlers({ git: createGitRunner(), guard: box.guard, ipc });
  call = (channel, ...args) => Promise.resolve(handlers.get(channel)!({ sender: {} }, ...args));
});

afterEach(() => box.cleanup());

describe("registerGitHandlers", () => {
  it("serves the read members from a real repository", async () => {
    write(path.join(box.root, "a.txt"), "one\ntwo\nthree\n");

    expect(await call(CH.gitRepoStatus, box.root)).toMatchObject({ branch: "main", changed: 1 });
    expect(await call(CH.gitReviewList, box.root, "uncommitted", null)).toMatchObject({ files: [{ path: "a.txt", added: 1 }] });
    expect(await call(CH.gitReviewDiff, box.root, "a.txt", { scope: "uncommitted" })).toContain("+three");
    expect(await call(CH.gitFileDiff, box.root, "a.txt")).toContain("+three");
    expect(await call(CH.gitReviewRevParse, box.root, "HEAD")).toMatch(/^[0-9a-f]{40}$/);
    expect(await call(CH.gitBranchList, box.root)).toHaveLength(1);
    expect(await call(CH.gitWorktreeList, box.root)).toHaveLength(1);
  });

  it("answers PR and ship info as 'no gh', never as an error", async () => {
    expect(await call(CH.gitReviewShipInfo, box.root)).toEqual({ ghReady: false, pr: null });
    expect(await call(CH.gitReviewPrList, box.root, ["main"])).toEqual({ ghReady: false, prs: [] });
  });

  it("answers empty for a repository path outside the project", async () => {
    expect(await call(CH.gitRepoStatus, box.outside)).toBeNull();
    expect(await call(CH.gitReviewList, box.outside, "uncommitted", null)).toEqual({ base: null, files: [] });
  });

  it("answers every mutation with the same readable refusal and changes nothing", async () => {
    write(path.join(box.root, "a.txt"), "changed\n");
    const before = git(box.root, "status", "--porcelain");

    const answer = await call(CH.gitMutation, { member: "commit" });

    expect(answer).toEqual({ member: "commit", message: NEEDS_APPROVAL_MESSAGE, needsApproval: true, ok: false });
    expect(await call(CH.gitMutation, "not an object")).toMatchObject({ member: "unknown", needsApproval: true });
    expect(git(box.root, "status", "--porcelain")).toBe(before);
    expect(git(box.root, "log", "--format=%s")).toBe("first\n");
  });
});

describe("renderer git bridge", () => {
  const { git: bridge } = gitApi(fakeIpc({ message: NEEDS_APPROVAL_MESSAGE, needsApproval: true }).ipc);

  it.each([
    ["stage", () => bridge.review.stage("/r", "a.txt")],
    ["unstage", () => bridge.review.unstage("/r", null)],
    ["revert", () => bridge.review.revert("/r", "a.txt")],
    ["commit", () => bridge.review.commit()],
    ["push", () => bridge.review.push()],
    ["createPr", () => bridge.review.createPr()],
    ["branchSwitch", () => bridge.branchSwitch()],
    ["worktreeAdd", () => bridge.worktreeAdd()],
    ["worktreeRemove", () => bridge.worktreeRemove()]
  ])("rejects %s with the approval message", async (_member, run) => {
    await expect(run()).rejects.toThrow(NEEDS_APPROVAL_MESSAGE);
    await expect(run()).rejects.toBeInstanceOf(NeedsApprovalError);
  });

  it("forwards reads over IPC with the shapes the main handlers expect", async () => {
    const { invoked, ipc } = fakeIpc([]);
    const { git: reads } = gitApi(ipc);

    await reads.review.diff("/r", "a.txt", "lastTurn", "abc", false);
    await reads.review.list("/r", "branch", null);
    await reads.repoStatus("/r");

    expect(invoked).toEqual([
      [CH.gitReviewDiff, "/r", "a.txt", { baseRef: "abc", scope: "lastTurn", staged: false }],
      [CH.gitReviewList, "/r", "branch", null],
      [CH.gitRepoStatus, "/r"]
    ]);
  });
});
