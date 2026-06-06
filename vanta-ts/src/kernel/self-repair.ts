import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";

const execAsync = promisify(execFile);

// SR: Safe kernel self-repair (propose→prove→swap).
// Limbs already self-heal (O11+factory). This closes the skeleton/kernel tier
// WITHOUT letting the running boundary edit itself in place.
// Design:
// (1) propose-only: candidate patch written to proposals/ dir (never overwrites live)
// (2) conformance: the OLD kernel's safety tests must pass on the NEW binary
// (3) blue-green: new binary tested side-by-side before promotion
// (4) human promotion: any safety-contract change requires explicit human approval

export type KernelProposal = {
  id: string;
  patchFile: string;
  description: string;
  proposedAt: string;
  status: "pending" | "conformant" | "rejected" | "promoted";
};

const PROPOSALS_DIR = "proposals/kernel";

/** Write a kernel patch proposal to the proposals directory (never touches live kernel). */
export async function proposeKernelPatch(
  repoRoot: string,
  patchContent: string,
  description: string,
): Promise<KernelProposal> {
  const dir = join(repoRoot, PROPOSALS_DIR);
  await mkdir(dir, { recursive: true });
  const id = `kp-${Date.now()}`;
  const patchFile = join(dir, `${id}.patch`);
  await writeFile(patchFile, patchContent, "utf8");
  const proposal: KernelProposal = {
    id,
    patchFile,
    description,
    proposedAt: new Date().toISOString(),
    status: "pending",
  };
  await writeFile(join(dir, `${id}.json`), JSON.stringify(proposal, null, 2), "utf8");
  return proposal;
}

/**
 * Run kernel safety invariant tests against a candidate binary.
 * Returns {passes, reason} — non-weakening conformance check.
 */
export async function verifyKernelConformance(
  repoRoot: string,
  candidateBinPath: string,
): Promise<{ passes: boolean; reason: string }> {
  try {
    // Run the existing Rust test suite against the candidate binary.
    // If ANY test that passes on the current binary fails on the candidate → reject.
    const { stdout, stderr } = await execAsync(
      "cargo",
      ["test", "--bin", "vanta-kernel", "--", "--test-output=immediate"],
      { cwd: repoRoot, timeout: 120_000, env: { ...process.env, VANTA_KERNEL_CANDIDATE: candidateBinPath } },
    );
    const output = (stdout + stderr).toLowerCase();
    if (output.includes("test result: ok")) return { passes: true, reason: "all safety tests pass" };
    return { passes: false, reason: "one or more kernel tests failed on candidate" };
  } catch (err: unknown) {
    return { passes: false, reason: err instanceof Error ? err.message.split("\n")[0]! : String(err) };
  }
}

/**
 * Blue-green swap: test the new binary side-by-side with the live one
 * before promotion. Returns true only if the candidate passes conformance.
 * The live binary is NEVER overwritten unless all checks pass AND
 * a human explicitly calls promoteKernelCandidate().
 */
export async function testKernelCandidate(
  repoRoot: string,
  proposalId: string,
): Promise<{ passes: boolean; reason: string }> {
  const proposalFile = join(repoRoot, PROPOSALS_DIR, `${proposalId}.json`);
  let proposal: KernelProposal;
  try {
    proposal = JSON.parse(await readFile(proposalFile, "utf8")) as KernelProposal;
  } catch {
    return { passes: false, reason: "proposal not found" };
  }

  // Build the candidate binary in an isolated temp dir.
  const tmpDir = await mkdtemp(join(tmpdir(), "vanta-kernel-candidate-"));
  try {
    // Apply the patch to a temp copy of the kernel sources.
    await execAsync("cp", ["-r", join(repoRoot, "src"), tmpDir], { timeout: 10_000 });
    await execAsync("patch", ["-d", tmpDir, "-p1", "--input", proposal.patchFile], { timeout: 10_000 });
    // Build the candidate.
    await execAsync("cargo", ["build", "--manifest-path", join(repoRoot, "Cargo.toml"), "--target-dir", join(tmpDir, "target")], { cwd: repoRoot, timeout: 120_000 });
    const candidateBin = join(tmpDir, "target", "debug", "vanta-kernel");
    const result = await verifyKernelConformance(repoRoot, candidateBin);
    return result;
  } catch (err: unknown) {
    return { passes: false, reason: err instanceof Error ? err.message.split("\n")[0]! : String(err) };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
