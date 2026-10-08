import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const raw = promisify(execFile);
export async function hostileGitFixture() {
  const root = await mkdtemp(join(tmpdir(), "vanta-hostile-git-"));
  const repo = join(root, "repo");
  const marker = join(root, "executed-marker");
  const script = join(root, "repository-command");
  const hooks = join(root, "hooks");
  await mkdir(repo); await mkdir(hooks);
  const git = async (args: string[], cwd = repo) => raw("git", args, { cwd, env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } });
  await git(["init", "-q", "--initial-branch=main"]);
  await git(["config", "user.email", "fixture@example.invalid"]);
  await git(["config", "user.name", "Fixture"]);
  await writeFile(join(repo, "file.txt"), "before\n");
  await git(["add", "."]); await git(["commit", "-qm", "fixture"]);
  await writeFile(script, `#!/bin/sh\nprintf 'repository sink\\n' >> '${marker}'\nexit 0\n`);
  await chmod(script, 0o700);
  for (const hook of ["pre-commit", "commit-msg", "post-checkout", "pre-push", "pre-receive", "update", "post-receive"]) {
    await writeFile(join(hooks, hook), await readFile(script)); await chmod(join(hooks, hook), 0o700);
  }
  const sinks = {
    "core.fsmonitor": script, "core.hooksPath": hooks, "core.pager": script,
    "core.editor": script, "sequence.editor": script, "credential.helper": `!${script}`,
    "core.sshCommand": script, "diff.external": script, "diff.hostile.command": script,
    "diff.hostile.textconv": script, "filter.hostile.clean": script,
    "filter.hostile.smudge": script, "filter.hostile.process": script,
    "filter.hostile.required": "true", "gpg.program": script, "commit.gpgSign": "true",
  };
  for (const [key, value] of Object.entries(sinks)) await git(["config", key, value]);
  await writeFile(join(repo, ".gitattributes"), "*.txt diff=hostile filter=hostile\n");
  await writeFile(join(repo, "file.txt"), "after\n");
  return { root, repo, marker, script, hooks, git, cleanup: () => rm(root, { recursive: true, force: true }) };
}
