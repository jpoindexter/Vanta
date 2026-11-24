import assert from "node:assert/strict";
import { access, unlink } from "node:fs/promises";
import { join } from "node:path";
import { hostileGitFixture } from "../src/git/hostile-fixture.ts";
import { gitExecFile } from "../src/git/process.ts";
import { gitStatusTool, gitDiffTool, gitCommitTool, gitBranchTool, gitCheckoutTool, gitPushTool } from "../src/tools/git.ts";
import { shellCmdTool } from "../src/tools/shell-cmd.ts";
import { expandContextRefs } from "../src/context/ref-expand.ts";
import { buildDesktopFileContext } from "../src/desktop/file-context.ts";
import { listChangedFiles, fileDiff } from "../src/repl/changed-files.ts";
import { diff } from "../src/repl/diff-cmd.ts";
import { gitLineDelta } from "../src/ui/status-git.ts";
import { checkCondition } from "../src/repl/goal-condition.ts";
import { runBashShortcut } from "../src/repl/shortcuts.ts";
import { defaultVcs } from "../src/factory/vcs.ts";
import { listPreExistingFiles } from "../src/factory/verify-checks.ts";

const f = await hostileGitFixture();
const steps = [];
let approvals = 0;
const ctx = { root: f.repo, requestApproval: async () => { approvals++; return false; } };
const markerAbsent = () => access(f.marker).then(() => false, () => true);
try {
  await f.git(["status", "--short"]);
  assert.equal(await markerAbsent(), false, "original unprotected Git must reproduce the fsmonitor effect");
  await unlink(f.marker);
  steps.push("original exploit reproduced; marker reset inside isolated fixture");
  assert.equal((await gitStatusTool.execute({}, ctx)).ok, true);
  assert.match((await gitDiffTool.execute({}, ctx)).output, /after/);
  for (const args of [["show", "HEAD:file.txt"], ["log", "-1", "--patch"], ["blame", "file.txt"], ["branch", "--list"], ["worktree", "list"]]) {
    assert.ok((await gitExecFile("git", args, { cwd: f.repo })).stdout);
    steps.push(`isolated ${args[0]} probe`);
  }
  assert.deepEqual(await gitLineDelta(f.repo), { added: 1, removed: 1 });
  assert.equal((await listChangedFiles(f.repo)).length, 2);
  assert.match(await fileDiff(f.repo, "file.txt"), /after/);
  assert.match((await expandContextRefs("@diff @git:1", f.repo)).block, /after/);
  assert.ok((await buildDesktopFileContext(f.repo)).changed.includes("file.txt"));
  assert.match((await diff("", { dataDir: join(f.repo, ".vanta") })).output, /file.txt/);
  assert.equal(await checkCondition("git status --short", f.repo), true);
  const safety = { assess: async () => ({ risk: "allow", reason: "read-only fixture" }) };
  assert.match(await runBashShortcut("git status --short", safety, f.repo), /file.txt/);
  assert.equal((await shellCmdTool.execute({ command: "git status --short" }, ctx)).ok, true);
  steps.push("actual Desktop file context, TUI rail, references, review, goal and shell consumers");
  assert.equal(await defaultVcs.isTreeDirty(f.repo), true);
  assert.deepEqual(await listPreExistingFiles(f.repo), new Set(["file.txt"]));
  steps.push("actual factory VCS probe and verifier inventory");
  for (const [tool, args] of [[gitCommitTool, { message: "denied" }], [gitBranchTool, { name: "denied" }], [gitCheckoutTool, { ref: "main" }], [gitPushTool, {}]]) {
    assert.equal((await tool.execute(args, ctx)).output, "denied");
    steps.push(`approval-denied ${tool.schema.name}`);
  }
  assert.equal(await markerAbsent(), true, "no repository sink before approval");
  const approved = { ...ctx, requestApproval: async () => true };
  assert.equal((await gitCommitTool.execute({ message: "approved isolated fixture" }, approved)).ok, true);
  assert.equal((await gitBranchTool.execute({ name: "approved" }, approved)).ok, true);
  assert.equal((await gitCheckoutTool.execute({ ref: "approved" }, approved)).ok, true);
  const remote = join(f.root, "remote.git");
  await f.git(["init", "-q", "--bare", remote]);
  await f.git(["config", "core.hooksPath", f.hooks], remote);
  await f.git(["remote", "add", "origin", remote]);
  assert.equal((await gitPushTool.execute({ remote: "origin", branch: "approved" }, approved)).ok, true);
  assert.equal(await markerAbsent(), true, "local and receiving hooks must remain inert after approval");
  steps.push("approved fixture commit, branch, checkout, local push with receiving hooks inert");
  console.log(JSON.stringify({ ok: true, steps, deniedApprovals: approvals, repositoryExecutionMarkers: 0,
    externalProviderRequests: 0, boundary: "isolated repositories and real shipped TypeScript consumers",
    gaps: ["bootstrap installer raw Git", "arbitrary interpreter/script invocation of Git", "remote shell Git adapter support", "concurrent config/attribute replacement"] }, null, 2));
} finally { await f.cleanup(); }
