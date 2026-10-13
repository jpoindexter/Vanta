import { EventEmitter } from "node:events";
import { chmodSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ALLOWED_SUBCOMMANDS, createGitRunner, gitEnvironment, resolveGitBinary, SAFE_REF, validateGitArgs } from "./git-runner";
import { git, initRepo, makeSandbox, type Sandbox, write } from "./project-test-helpers";

let box: Sandbox;

afterEach(() => box?.cleanup());

describe("validateGitArgs", () => {
  it.each([
    [["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=normal"]],
    [["diff", "--numstat", "-z", "--no-ext-diff", "--no-textconv", "HEAD"]],
    [["diff", "--cached", "--", "src/a.ts"]],
    [["diff", "origin/main", "HEAD", "--", "a b.txt"]],
    [["log", "-n", "5", "--format=%H%x1f%s"]],
    [["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]],
    [["branch", "--list", "--all", "--format=%(refname)%09%(HEAD)%09%(worktreepath)"]],
    [["ls-files", "-z", "--others", "--exclude-standard", "--", "x"]],
    [["merge-base", "HEAD", "origin/main"]],
    [["worktree", "list", "--porcelain"]],
    [["check-ignore", "--", "dist"]]
  ])("allows %j", args => {
    expect(validateGitArgs(args)).toBeNull();
  });

  it.each([
    [["push"], "not an allowed command"],
    [["commit", "-m", "x"], "not an allowed command"],
    [["checkout", "main"], "not an allowed command"],
    [["config", "user.name", "x"], "not an allowed command"],
    [["-c", "core.pager=sh", "status"], "not an allowed command"],
    [["status", "-c", "core.fsmonitor=/bin/sh"], "not allowed"],
    [["diff", "--output=/tmp/x"], "not allowed"],
    [["diff", "--no-index", "--", "/etc/passwd", "/dev/null"], "not allowed"],
    [["diff", "--ext-diff"], "not allowed"],
    [["diff", "--textconv"], "not allowed"],
    [["diff", "--exec-path=/tmp"], "not allowed"],
    [["diff", "HEAD:secret.txt"], "plain ref"],
    [["diff", "a b"], "plain ref"],
    [["diff", "--upload-pack=evil"], "not allowed"],
    [["log", "-n", "5000"], "up to 1000"],
    [["log", "-n", "abc"], "up to 1000"],
    [["log", "--format=%H%n%x00evil"], "not allowed"],
    [["status", "HEAD"], "not allowed"],
    [["worktree", "add", "../x"], "not allowed"],
    [["worktree", "remove", "x"], "not allowed"],
    [["branch", "-D", "main"], "not allowed"],
    [["branch", "newname"], "not allowed"],
    [["rev-parse", "--git-dir"], "not allowed"],
    [["ls-files", "--", ":(top)x"], "path argument"],
    [["diff", "--", "a\0b"], "path argument"],
    [[""], "not an allowed command"],
    [[], "not an allowed command"]
  ])("refuses %j", (args, reason) => {
    expect(validateGitArgs(args)).toContain(reason);
  });

  it("only lists read-only subcommands", () => {
    expect([...ALLOWED_SUBCOMMANDS].sort()).toEqual(
      ["branch", "check-ignore", "diff", "log", "ls-files", "merge-base", "rev-parse", "status", "worktree"].sort()
    );
  });

  it.each(["main", "origin/feature-x", "HEAD~2", "v1.0.0", "abc123def", "HEAD^{commit}"])("accepts the ref %s", ref => {
    expect(SAFE_REF.test(ref)).toBe(true);
  });

  it.each(["--output=x", "-n", "a b", "x:y", "a\nb", "", "x*"])("rejects the ref %j", ref => {
    expect(SAFE_REF.test(ref)).toBe(false);
  });
});

describe("environment", () => {
  it("passes git no credentials, no user config, no pager and no prompts", () => {
    const env = gitEnvironment();

    expect(env).toMatchObject({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" });
    expect(Object.keys(env).sort()).toEqual(
      ["GIT_ASKPASS", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_OPTIONAL_LOCKS", "GIT_PAGER", "GIT_TERMINAL_PROMPT", "HOME", "LC_ALL", "PATH"].sort()
    );
  });

  it("finds the first installed git, or null", () => {
    expect(resolveGitBinary(file => file === "/usr/local/bin/git")).toBe("/usr/local/bin/git");
    expect(resolveGitBinary(() => false)).toBeNull();
  });
});

describe("runner against a real repository", () => {
  it("runs an allowed command in the given folder", async () => {
    box = makeSandbox();
    initRepo(box.root);

    const result = await createGitRunner().run(box.root, ["status", "--porcelain=v2", "--branch", "-z"]);

    expect(result).toMatchObject({ code: 0, ok: true, truncated: false });
    expect(result.ok && result.stdout).toContain("# branch.head main");
  });

  it("refuses a disallowed command without starting a process", async () => {
    const spawn = vi.fn();
    const runner = createGitRunner({ gitBin: "/usr/bin/git", spawn: spawn as never });

    expect(await runner.run("/tmp", ["push", "origin", "main"])).toEqual({ error: "git push is not an allowed command", ok: false });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("reports a missing git", async () => {
    expect(await createGitRunner({ gitBin: null }).run("/tmp", ["status"])).toEqual({ error: "git is not installed on this computer.", ok: false });
  });

  it("does not run a core.fsmonitor program planted in the repository's own config", async () => {
    box = makeSandbox();
    initRepo(box.root);
    const marker = path.join(box.root, "pwned");
    const script = write(path.join(box.root, "fsmon.sh"), `#!/bin/sh\ntouch ${marker}\n`);
    chmodSync(script, 0o755);
    git(box.root, "config", "core.fsmonitor", script);

    // Control: plain git DOES run it, so the assertion below is about the runner and not a dead fixture.
    git(box.root, "status", "--porcelain");
    expect(existsSync(marker)).toBe(true);
    rmSync(marker);

    await createGitRunner().run(box.root, ["status", "--porcelain=v2"]);

    expect(existsSync(marker)).toBe(false);
  });

  it("does not run a diff.external program or a textconv filter named in the repository's config", async () => {
    box = makeSandbox();
    initRepo(box.root);
    const marker = path.join(box.root, "pwned2");
    const script = write(path.join(box.root, "ext.sh"), `#!/bin/sh\ntouch ${marker}\n`);
    chmodSync(script, 0o755);
    git(box.root, "config", "diff.external", script);
    write(path.join(box.root, "a.txt"), "changed\n");

    git(box.root, "diff", "--", "a.txt");
    expect(existsSync(marker)).toBe(true);
    rmSync(marker);

    const result = await createGitRunner().run(box.root, ["diff", "--no-ext-diff", "--no-textconv", "--no-color", "--", "a.txt"]);

    expect(result.ok && result.stdout).toContain("+changed");
    expect(existsSync(marker)).toBe(false);
  });

  it("answers a non-zero exit as an error unless the caller says that code is an answer", async () => {
    box = makeSandbox();
    initRepo(box.root);
    const runner = createGitRunner();

    expect(await runner.run(box.root, ["merge-base", "HEAD", "nope"])).toMatchObject({ ok: false });
    expect(await runner.run(box.root, ["check-ignore", "--", "a.txt"], { okCodes: [1] })).toMatchObject({ code: 1, ok: true, stdout: "" });
  });

  it("caps the output and says it was truncated", async () => {
    box = makeSandbox();
    initRepo(box.root);
    write(path.join(box.root, "big.txt"), "line\n".repeat(20000));
    git(box.root, "add", "-A");

    const result = await createGitRunner({ maxBytes: 1000 }).run(box.root, ["diff", "--cached", "--no-ext-diff", "--no-textconv"]);

    expect(result).toMatchObject({ ok: true, truncated: true });
    expect(result.ok && result.stdout.length).toBeLessThanOrEqual(1000);
  });
});

describe("runner timeout", () => {
  it("kills a git that does not finish", async () => {
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), { kill: vi.fn(), stderr: new EventEmitter(), stdout: new EventEmitter() });
    const spawn = vi.fn(() => child);
    const pending = createGitRunner({ gitBin: "/usr/bin/git", spawn: spawn as never, timeoutMs: 50 }).run("/tmp", ["status"]);

    await vi.advanceTimersByTimeAsync(60);

    expect(await pending).toEqual({ error: "git took too long and was stopped.", ok: false });
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    vi.useRealTimers();
  });
});
