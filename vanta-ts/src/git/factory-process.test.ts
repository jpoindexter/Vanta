import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { hostileGitFixture } from "./hostile-fixture.js";
import { defaultVcs } from "../factory/vcs.js";
import { execute } from "../factory/executor.js";
import { buildVerifyChecks } from "../factory/verifier.js";
import { listPreExistingFiles } from "../factory/verify-checks.js";
import type { FactoryPlan, VerifyCheckCtx } from "../factory/types.js";

vi.mock("../agent.js", () => ({ createConversation: () => ({ send: async () => ({ usage: { outputTokens: 3 } }) }) }));
vi.mock("../session.js", () => ({ prepareRun: async () => ({ systemPrompt: "fixture", provider: {}, safety: {}, registry: {} }), buildSummarizer: () => undefined }));
vi.mock("../factory/verify-checks.js", async (load) => ({ ...await load<object>(), runTestFiles: async () => 1 }));
const absent = (path: string) => access(path).then(() => false, () => true);

describe("actual factory Git callers share repository isolation", () => {
  it("VCS reads, branch, commit and local push never execute repository filters/hooks", async () => {
    const f = await hostileGitFixture();
    try {
      expect(await defaultVcs.isTreeDirty(f.repo)).toBe(true);
      expect(await defaultVcs.currentBranch(f.repo)).toBe("main");
      expect(await absent(f.marker)).toBe(true);
      const branch = await defaultVcs.createBranch(f.repo);
      expect(branch).toMatch(/^factory\/auto-/);
      expect(await defaultVcs.commit(f.repo, "exact factory fixture")).toMatch(/^[a-f0-9]{7}$/);
      expect(await defaultVcs.lastCommitLineCount(f.repo)).toBeGreaterThan(0);
      const remote = join(f.root, "remote.git");
      await f.git(["init", "-q", "--bare", remote]);
      await f.git(["config", "core.hooksPath", f.hooks], remote);
      await f.git(["remote", "add", "origin", remote]);
      await defaultVcs.push(f.repo);
      expect((await f.git(["rev-parse", branch], remote)).stdout).toMatch(/^[a-f0-9]{40}/);
      expect(await absent(f.marker)).toBe(true);
    } finally { await f.cleanup(); }
  });

  it("executor harvest and verifier inventory/stash use real Git with provider/test execution explicitly stubbed", async () => {
    const f = await hostileGitFixture();
    try {
      expect(await listPreExistingFiles(f.repo)).toEqual(new Set(["file.txt"]));
      const plan = { touchedDirs: [], instruction: "fixture only" } as unknown as FactoryPlan;
      const artifact = await execute(f.repo, plan, 10);
      expect(artifact.touchedFiles).toContain("file.txt");
      expect(artifact.touchedFiles).toContain(".gitattributes");
      expect(artifact.tokenSpend).toBe(3);
      const check = buildVerifyChecks().find((item) => item.name === "new-tests-fail-on-prechange")!;
      const context = { root: f.repo, tsRoot: f.repo, artifact: { touchedFiles: ["new.test.ts"], newTestFiles: [], tokenSpend: 0 }, preExisting: new Set() } satisfies VerifyCheckCtx;
      expect(await check.run(context)).toEqual({ ok: true });
      expect(await readFile(join(f.repo, "file.txt"), "utf8")).toBe("after\n");
      expect(await absent(f.marker)).toBe(true);
    } finally { await f.cleanup(); }
  });

  it("normal factory discard keeps its existing scoped cleanup behavior", async () => {
    const f = await hostileGitFixture();
    try {
      await mkdir(join(f.repo, "vanta-ts", "src"), { recursive: true });
      const generated = join(f.repo, "vanta-ts", "src", "fixture-only.ts");
      await writeFile(generated, "temporary fixture\n");
      await defaultVcs.discardSlice(f.repo);
      expect(await absent(generated)).toBe(true);
      expect(await readFile(join(f.repo, "file.txt"), "utf8")).toBe("before\n");
      expect(await absent(f.marker)).toBe(true);
    } finally { await f.cleanup(); }
  });
});
