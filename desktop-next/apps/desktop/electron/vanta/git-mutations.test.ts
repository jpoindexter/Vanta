import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bridgeChange } from "./bridge-native";
import { fakeIpc } from "./bridge-test-helpers";
import { CH } from "./channels";
import { failureReason } from "./gated-run";
import type { GitContext } from "./git-common";
import { NO_CHAT_MESSAGE, registerGitMutations } from "./git-mutation-handlers";
import { mutationRequest, planMutation, shellQuote } from "./git-mutations";
import { createGitRunner } from "./git-runner";
import type { IpcLike } from "./native-handlers";
import { git, initRepo, makeSandbox, type Sandbox, write } from "./project-test-helpers";

let box: Sandbox;
let ctx: GitContext;

beforeEach(() => {
  box = makeSandbox();
  initRepo(box.root);
  ctx = { git: createGitRunner(), guard: box.guard };
});

afterEach(() => box.cleanup());

const plan = (request: unknown) => planMutation(ctx, mutationRequest.parse(request));
const commandsOf = async (request: unknown) => {
  const result = await plan(request);

  return result.ok === false ? result.message : result.commands;
};

describe("shellQuote", () => {
  it.each([
    ["plain.txt", "'plain.txt'"],
    ["a b.txt", "'a b.txt'"],
    ["it's.txt", `'it'\\''s.txt'`],
    ["$(rm -rf ~)", "'$(rm -rf ~)'"],
    ["a;b&&c|d`e`", "'a;b&&c|d`e`'"]
  ])("quotes %j so it is one literal argument", (value, quoted) => {
    expect(shellQuote(value)).toBe(quoted);
  });
});

describe("plans", () => {
  it("stages one file by name, quoted", async () => {
    write(path.join(box.root, "a b's.txt"), "x");

    expect(await commandsOf({ file: "a b's.txt", op: "stage", repo: box.root })).toEqual([`git add -- 'a b'\\''s.txt'`]);
  });

  it("stages everything that changed, by name, never a blanket add, and never a secret", async () => {
    write(path.join(box.root, "a.txt"), "changed\n");
    write(path.join(box.root, "new.txt"), "n\n");
    write(path.join(box.root, ".env"), "KEY=1\n");

    const commands = await commandsOf({ file: null, op: "stage", repo: box.root });

    expect(commands).toEqual([`git add -- 'a.txt' 'new.txt'`]);
    expect(JSON.stringify(commands)).not.toContain(".env");
    expect(JSON.stringify(commands)).not.toContain("add -A");
  });

  it("splits a very long list into several commands", async () => {
    for (let index = 0; index < 95; index += 1) {
      write(path.join(box.root, `f${String(index).padStart(3, "0")}.txt`), "x");
    }

    const commands = (await commandsOf({ file: null, op: "stage", repo: box.root })) as string[];

    expect(commands).toHaveLength(3);
    expect(commands.every(command => command.startsWith("git add -- "))).toBe(true);
  });

  it.each([
    ["a secret file", ".env"],
    ["a nested secret", "config/.ssh/id_rsa"],
    ["an absolute path", "/etc/passwd"],
    ["a .. path", "../outside/secret.txt"]
  ])("refuses to stage %s", async (_label, file) => {
    expect(await commandsOf({ file, op: "stage", repo: box.root })).toMatch(/secrets|stage/);
  });

  it("unstages a file or everything", async () => {
    expect(await commandsOf({ file: "a.txt", op: "unstage", repo: box.root })).toEqual([`git reset -q -- 'a.txt'`]);
    expect(await commandsOf({ file: null, op: "unstage", repo: box.root })).toEqual(["git reset -q"]);
  });

  it("reverts a tracked file with restore and an untracked file with clean", async () => {
    write(path.join(box.root, "a.txt"), "changed\n");
    write(path.join(box.root, "new.txt"), "n\n");

    expect(await commandsOf({ file: "a.txt", op: "revert", repo: box.root })).toEqual([
      `git restore --source=HEAD --staged --worktree -- 'a.txt'`
    ]);
    expect(await commandsOf({ file: "new.txt", op: "revert", repo: box.root })).toEqual([`git clean -f -- 'new.txt'`]);
    expect(await commandsOf({ file: null, op: "revert", repo: box.root })).toEqual([
      `git restore --source=HEAD --staged --worktree -- 'a.txt'`,
      `git clean -f -- 'new.txt'`
    ]);
  });

  it("says there is nothing to revert for a clean file", async () => {
    expect(await commandsOf({ file: "a.txt", op: "revert", repo: box.root })).toBe("There is nothing to revert.");
  });

  it("commits what is staged, or stages the changes first when nothing is, with the message as one quoted argument", async () => {
    write(path.join(box.root, "a.txt"), "changed\n");
    const message = `fix: "quote" and 'apostrophe' $(touch pwned)`;

    expect(await commandsOf({ message, op: "commit", push: false, repo: box.root })).toEqual([
      `git add -- 'a.txt'`,
      `git commit -m ${shellQuote(message)}`
    ]);

    git(box.root, "add", "a.txt");
    expect(await commandsOf({ message: "x", op: "commit", push: false, repo: box.root })).toEqual([`git commit -m 'x'`]);
  });

  it("pushes with -u origin <branch> when there is no upstream, and never to an invented remote otherwise", async () => {
    write(path.join(box.root, "a.txt"), "changed\n");

    expect(await commandsOf({ message: "x", op: "commit", push: true, repo: box.root })).toEqual([
      `git add -- 'a.txt'`,
      `git commit -m 'x'`,
      `git push -u origin 'main'`
    ]);
    expect(await commandsOf({ op: "push", repo: box.root })).toEqual([`git push -u origin 'main'`]);
  });

  it("refuses to commit with nothing to commit", async () => {
    expect(await commandsOf({ message: "x", op: "commit", push: false, repo: box.root })).toBe("There is nothing to commit.");
  });

  it("switches to a local branch, and tracks a remote one", async () => {
    git(box.root, "branch", "topic");

    expect(await commandsOf({ branch: "topic", op: "branchSwitch", repo: box.root })).toEqual([`git switch 'topic'`]);
    expect(await commandsOf({ branch: "origin/other", op: "branchSwitch", repo: box.root })).toEqual([`git switch --track 'origin/other'`]);
  });

  it.each(["--detach", "a b", "x;rm -rf ~", "a..b", "x{y}", ""])("refuses to switch to %j", async branch => {
    expect(await commandsOf({ branch, op: "branchSwitch", repo: box.root })).toBe("That is not a branch name Vanta can switch to.");
  });

  it("refuses a folder that is not a repository in the project", async () => {
    expect(await commandsOf({ file: "a.txt", op: "stage", repo: box.outside })).toBe("That folder is not a Git repository inside this project.");
  });

  it("uses git -C for a repository inside a project subfolder", async () => {
    const sub = path.join(box.root, "pkg");
    write(path.join(sub, "x.txt"), "x\n");
    git(sub, "init", "-q", "-b", "main");

    expect(await commandsOf({ file: "x.txt", op: "stage", repo: sub })).toEqual([`git -C 'pkg' add -- 'x.txt'`]);
  });
});

const planOf = async (request: unknown) => {
  const result = await plan(request);

  if (result.ok === false) {
    throw new Error(result.message);
  }

  return result;
};

const sh = (command: string) =>
  execFileSync("sh", ["-c", command], { cwd: box.root, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } });

describe("worktrees", () => {
  it("adds a worktree on a new branch under .worktrees, and the command is valid git", async () => {
    const result = await planOf({ name: "Fix the build!", op: "worktreeAdd", repo: box.root });
    const created = result.result as { branch: string; path: string; repoRoot: string };

    expect(created).toEqual({ branch: "vanta/fix-the-build", path: path.join(box.root, ".worktrees", "fix-the-build"), repoRoot: box.root });
    expect(result.commands).toEqual([`git worktree add -b 'vanta/fix-the-build' '${created.path}'`]);

    sh(result.commands[0] as string);
    expect(existsSync(path.join(created.path, "a.txt"))).toBe(true);
    expect(git(box.root, "branch", "--list", "vanta/fix-the-build").trim()).toContain("vanta/fix-the-build");
  });

  it("picks a free folder when the name is taken", async () => {
    const first = await planOf({ name: "work", op: "worktreeAdd", repo: box.root });
    sh(first.commands[0] as string);

    const second = (await planOf({ name: "work", op: "worktreeAdd", repo: box.root })).result as { path: string };

    expect(second.path).toBe(path.join(box.root, ".worktrees", "work-2"));
  });

  it("branches off a base, and does not track a remote base", async () => {
    git(box.root, "branch", "topic");

    expect((await planOf({ base: "topic", branch: "feature/x", name: "x", op: "worktreeAdd", repo: box.root })).commands[0]).toBe(
      `git worktree add -b 'feature/x' '${path.join(box.root, ".worktrees", "x")}' 'topic'`
    );
    expect((await planOf({ base: "origin/main", name: "y", op: "worktreeAdd", repo: box.root })).commands[0]).toContain("--no-track 'origin/main'");
  });

  it("checks out an existing local branch, and tracks a remote-only one", async () => {
    git(box.root, "branch", "topic");

    const local = await planOf({ existingBranch: "topic", op: "worktreeAdd", repo: box.root });
    expect(local.commands[0]).toBe(`git worktree add '${path.join(box.root, ".worktrees", "topic")}' 'topic'`);
    sh(local.commands[0] as string);

    const remote = await planOf({ existingBranch: "origin/feat", op: "worktreeAdd", repo: box.root });
    expect(remote.commands[0]).toBe(`git worktree add --track -b 'feat' '${path.join(box.root, ".worktrees", "origin-feat")}' 'origin/feat'`);
  });

  it.each([
    ["a base with spaces", { base: "a b", name: "n" }],
    ["a base that starts like an option", { base: "--force", name: "n" }]
  ])("refuses %s", async (_label, fields) => {
    expect(await commandsOf({ op: "worktreeAdd", repo: box.root, ...fields })).toBe("That is not a branch name Vanta can use.");
  });

  it("cleans a typed branch name instead of passing odd characters on", async () => {
    const result = await planOf({ branch: "feat/x{y} z;rm -rf ~", name: "n", op: "worktreeAdd", repo: box.root });

    expect(result.commands[0]).toContain("-b 'feat/xy-zrm-rf'");
    expect(result.commands[0]).not.toMatch(/[;{}~]/);
  });

  it("removes one of the project's extra worktrees, with --force only when asked", async () => {
    const created = await planOf({ name: "gone", op: "worktreeAdd", repo: box.root });
    sh(created.commands[0] as string);
    const tree = (created.result as { path: string }).path;

    expect(await commandsOf({ op: "worktreeRemove", repo: box.root, worktreePath: tree })).toEqual([`git worktree remove -- '${tree}'`]);
    expect(await commandsOf({ force: true, op: "worktreeRemove", repo: box.root, worktreePath: tree })).toEqual([`git worktree remove --force -- '${tree}'`]);
  });

  it.each([
    ["the main checkout", () => box.root],
    ["a folder that is not a worktree", () => path.join(box.root, "src")],
    ["a path outside the project", () => box.outside]
  ])("refuses to remove %s", async (_label, tree) => {
    expect(await commandsOf({ op: "worktreeRemove", repo: box.root, worktreePath: tree() })).toContain("extra worktrees");
  });
});

describe("request schema", () => {
  it.each([
    ["an unknown op", { op: "reset-hard", repo: "/r" }],
    ["an empty commit message", { message: "   ", op: "commit", push: false, repo: "/r" }],
    ["an oversized commit message", { message: "x".repeat(5001), op: "commit", push: false, repo: "/r" }],
    ["a missing repo", { file: null, op: "stage" }],
    ["a non-boolean push", { message: "x", op: "commit", push: "yes", repo: "/r" }]
  ])("rejects %s", (_label, request) => {
    expect(mutationRequest.safeParse(request).success).toBe(false);
  });
});

describe("handler", () => {
  function setup(outcomes: Array<{ ok: boolean; output: string }>, client: null | string = "chat-1") {
    const handlers = new Map<string, (event: { sender: unknown }, ...args: unknown[]) => unknown>();
    const ipc = { handle: (c, f) => handlers.set(c, f as never), on: () => undefined } as IpcLike;
    const queue = [...outcomes];
    const run = vi.fn(async () => queue.shift() ?? { ok: true, output: "" });
    registerGitMutations({ ...ctx, clientFor: () => client ?? undefined, ipc, run });

    return { call: (raw: unknown) => Promise.resolve(handlers.get(CH.gitMutate)!({ sender: {} }, raw)), run };
  }

  it("runs the planned commands in order, each for the same chat, and answers ok", async () => {
    write(path.join(box.root, "a.txt"), "changed\n");
    const { call, run } = setup([]);

    expect(await call({ message: "msg", op: "commit", push: false, repo: box.root })).toEqual({ ok: true });
    expect(run.mock.calls).toEqual([
      [`git add -- 'a.txt'`, "chat-1"],
      [`git commit -m 'msg'`, "chat-1"]
    ]);
  });

  it("stops at the first command that is not approved or fails, and says why without the sandbox noise", async () => {
    write(path.join(box.root, "a.txt"), "changed\n");
    const { call, run } = setup([
      { ok: false, output: "git: error: unable to read SDK settings for '/'\ndenied by user: irreversible action" }
    ]);

    expect(await call({ message: "msg", op: "commit", push: false, repo: box.root })).toEqual({
      message: "denied by user: irreversible action",
      ok: false
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no chat is open to show the approval card", async () => {
    write(path.join(box.root, "a.txt"), "changed\n");
    const { call, run } = setup([], null);

    expect(await call({ file: "a.txt", op: "stage", repo: box.root })).toEqual({ message: NO_CHAT_MESSAGE, ok: false });
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses a malformed request without planning or running anything", async () => {
    const { call, run } = setup([]);

    expect(await call({ op: "stage" })).toMatchObject({ ok: false });
    expect(await call("stage")).toMatchObject({ ok: false });
    expect(run).not.toHaveBeenCalled();
  });

  it("passes a plan refusal back and runs nothing", async () => {
    const { call, run } = setup([]);

    expect(await call({ file: ".env", op: "stage", repo: box.root })).toMatchObject({ message: expect.stringContaining("secrets"), ok: false });
    expect(run).not.toHaveBeenCalled();
  });
});

describe("failureReason", () => {
  it("skips the macOS sandbox noise and keeps the real reason", () => {
    expect(
      failureReason("git: error: unable to read SDK settings for '/'\nwarning: unable to access '/etc/gitattributes': Operation not permitted\nfatal: pathspec 'x' did not match")
    ).toBe("fatal: pathspec 'x' did not match");
    expect(failureReason("")).toBe("The command did not succeed.");
  });
});

describe("renderer side", () => {
  it("resolves ok when main made the change, and rejects with main's reason when it did not", async () => {
    await expect(bridgeChange(fakeIpc({ ok: true }).ipc, { op: "push", repo: "/r" })()).resolves.toEqual({ ok: true });
    await expect(bridgeChange(fakeIpc({ message: "denied by user", ok: false }).ipc, { op: "push", repo: "/r" })()).rejects.toThrow("denied by user");
    await expect(bridgeChange(fakeIpc(null).ipc, { op: "push", repo: "/r" })()).rejects.toThrow("not made");
  });
});
