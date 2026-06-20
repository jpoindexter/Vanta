# Verified contribution pool (untrusted workers) — design spike

> Card: `VERIFIED-CONTRIBUTION-POOL` (track Harness, rock, after `AUTO-RESEARCH-LOOP`).
> Source idea: Karpathy's untrusted-pool / folding@home / blockchain-of-commits — *finding* an improvement is expensive, *verifying* it is cheap.
> **SPIKE ONLY. No executable code. The done-criterion is this document.**
> Verdict: **Conditional GO — build the verify rig now; gate the untrusted-intake surface behind explicit sign-off and do not ship it in slice 1.**

## Concept — the asymmetry, in Vanta terms

A patch that beats baseline is hard to produce (search, taste, many tries) but cheap to *check*: apply it in isolation, run the eval, run the regression locks, read two numbers. So the trust you need from the *producer* collapses to near-zero — you don't have to trust who wrote a diff if you can mechanically prove it beats the bar without believing them. That is exactly the trust model Vanta already runs internally: `auto-research/loop.ts:runAutoResearch` proposes a candidate in an isolated worktree, re-measures a numeric metric via `auto-research/metric.ts:runMetric`, and `candidate()` keeps it only when `delta > 0` (`kept = Boolean(commit.sha) && delta > 0`). The factory's `factory/verifier.ts:verify` is the same shape for code: protected-path check → born-small gate → new-tests-fail-on-old-code → full suite → `tsc`. And `selfcorrect/loop.ts:selfCorrect` ends every repair by writing a `verify/store.ts` regression lock so a fix can't silently rot.

The contribution pool is **the same verify rig pointed at an untrusted producer instead of a trusted one**. Nothing about *who* sent the patch changes the gate; the only new surface is the intake of a candidate from outside the trust boundary, and the only new risk is running that candidate's code. Everything downstream already exists.

## Threat model

Trust boundary: **the patch and any code/tests it carries are hostile until proven otherwise.** A candidate is `{ baseRev, diff, claimedMetric }` from an unauthenticated source.

What must never happen (Rule Zero — `src/safety.rs`, root `CLAUDE.md` §"Rule zero"):

| Threat | Vector | Why it matters |
|---|---|---|
| Arbitrary code exec on host | malicious payload in build/test/eval scripts | the whole point — eval/test/`tsc` *run* attacker-controlled code |
| Eval/lock tampering | patch edits `verify/store.ts`, `mem-eval/*`, the metric command, or a lock file to fake a pass | a producer that can rewrite the scorer wins for free |
| Reward-hacking the gate | weak test that exercises nothing; metric printing a constant | already a known factory failure mode — `factory/holdout.ts` exists *because* "the same cycle writes code + test, enabling weak-test reward-hacking" |
| Exfiltration | patch opens a socket from the sandbox, reads `~/.ssh`/`.env`/`google-tokens.json` | network egress + secret read; `safety.rs` already classes `EXFIL`/`MACHINE_CONFIG` as Block/Ask |
| Resource exhaustion | fork bomb, infinite loop, disk fill | `:(){` is in `safety.rs:DESTRUCTIVE`; runtime needs CPU/mem/disk/time bounds too |
| Lock irreversibility | candidate `git push --force` / history rewrite / `rm -rf` | `safety.rs` `DATA_LOSS`/`IRREVERSIBLE` already escalate these; the merge step must stay kernel-gated |

The defense is **isolation for execution** and **kernel-gating for the irreversible step (merge)** — never one or the other alone.

## Pipeline — sandbox-then-verify

Ordered flow. Each stage maps to a real module; new wiring is named explicitly.

```
0. intake        candidate {baseRev, diff, claimedMetric}        [NEW surface — gated, see below]
1. static screen pre-flight the diff before anything runs        factory/preflight.ts + verifier.ts pure checks
2. isolate       fresh worktree, then a no-network sandbox        worktree/manager.ts + exec/backend.ts
3. apply         git apply the diff INSIDE the worktree           worktree/manager.ts (git in worktree cwd)
4. verify-in-box run eval + regression locks IN the sandbox       mem-eval/run.ts + verify/check.ts + factory/verifier.ts
5. grade         beats-baseline? locks pass? clean assess?        recallAtK / parseMetricOutput / gradeRun + holdout
6. accept/reject pure decision, fail-closed                       new grader (mirrors factory/merge.ts:assessMergeRisk)
7. merge         kernel-assessed, human-gated land                safety-client.ts:assess + worktree merge
```

**0 — Intake (the only genuinely new trust surface).** A queue of `{ baseRev, diff, claimedMetric, source }`. `claimedMetric` is a *hint for triage ordering only* — never trusted, always re-measured at stage 5. This stage runs **no candidate code.**

**1 — Static screen (no execution).** Reuse the factory's pure gates against the diff's file list *before* touching a runtime:
- `factory/verifier.ts:checkNoProtectedPaths` — reject any diff touching `src/*.rs`, `Cargo.*`, `factory/*.ts`, `MANIFESTO.md` (mirrors `src/safety.rs:is_protected_path`).
- `factory/verifier.ts:checkNoExistingTestModified` — a candidate may *add* tests, never edit an existing one (otherwise it rewrites its own acceptance check).
- **Eval/lock immutability (NEW, critical):** reject any diff touching `vanta-ts/src/verify/**`, `vanta-ts/src/mem-eval/**`, `.vanta/verify.jsonl`, or the metric command's script. The producer must not be able to move the bar it's judged against.
- `factory/preflight.ts:scoreAmbiguity` if the candidate carries a description — drop garbage early.

**2 — Isolate (defense in depth: worktree ⊕ sandbox, network OFF).** `worktree/manager.ts:createWorktree(repoRoot, "contrib", baseDir)` gives a throwaway branch off `baseRev` (the same primitive `auto-research/loop.ts:candidate` already uses). The worktree alone is *not* containment — it shares the host FS/network. So every command in stages 3–4 runs through `exec/backend.ts:wrapExec` with `VANTA_EXEC_BACKEND=docker` (`buildDockerArgs`: `--rm`, mounts *only* the worktree + tmp, `-w` worktree, `--network none`), or `VANTA_SANDBOX=1` (`sandbox/run.ts:maybeSandbox` → bwrap/seatbelt, write-confined to root+zones+tmp). **`VANTA_SANDBOX_NET` stays unset** — no egress, killing the exfil + phone-home vectors. Note the honest gap: `sandbox/run.ts:isSandboxError` refuses to run when `VANTA_SANDBOX=1` but no backend exists — for untrusted code that refuse-to-run posture is correct and must be the default (no silent unsandboxed fallback the way `wrapExec` allows for *trusted* local use). Add CPU/mem/pids/disk/wall-clock limits at this layer.

**3 — Apply.** `git apply` (then `git stash`-style restore on failure) inside the worktree cwd. A diff that doesn't apply cleanly to `baseRev` is rejected before any build.

**4 — Verify-in-box.** Inside the sandbox, against the patched worktree:
- **Eval:** `mem-eval/run.ts` (or the card-relevant eval) for a numeric score; `mem-eval/grade.ts:recallAtK` is the deterministic grader. For an arbitrary objective, the metric command via `auto-research/metric.ts:runMetric` → `parseMetricOutput` (last number on stdout).
- **Regression locks:** every lock from `verify/store.ts:latestLocks`, each re-run and folded by `verify/check.ts:gradeRun` (non-zero exit *or* missing substring = regressed). Caveat: the live `tools/regression-lock.ts:checkOne` is `requestApproval`-gated per command — fine interactively, wrong for an autonomous pool; the pool must run lock commands *only inside the sandbox*, so the isolation **is** the authorization, replacing the per-command human prompt.
- **Code-trust gate:** `factory/verifier.ts:verify` (born-small, new-tests-fail-on-old-code, full prior suite green, `tsc` clean).
- **Anti-gaming:** `factory/holdout.ts:generateHoldout` / `validateAgainstHoldout` — a *different* model authors acceptance criteria + watches for the named anti-patterns, so the producer can't grade its own work. (Today this is built-but-unwired per `factory/CLAUDE.md`; the pool is the place to wire it.)

**5–6 — Grade & decide (pure, fail-closed).** A new pure grader, modeled exactly on `factory/merge.ts:assessMergeRisk` (which already "fails closed — any failing check blocks the merge"). All must hold or reject; ties reject.

**7 — Merge (kernel-gated, human go/no-go).** The land is the one irreversible step, so it goes through the boundary the rest of Vanta uses: `safety-client.ts:assess()` on the merge action, then a human approval, then `worktree/manager.ts:mergeWorktreeBranch` into a **non-default integration branch** (never `main` — `factory/merge.ts:isDefaultBranch` + `resolveMergeTarget`). The kernel `assess()` is upstream of execution on every backend, so isolation choice never weakens it.

## Accept criteria — precise, falsifiable

A candidate lands **iff all five hold** (else reject; unknown = reject):

1. **Static screen clean** — `checkNoProtectedPaths` ∧ `checkNoExistingTestModified` ∧ touches no eval/lock/metric path (stage 1).
2. **Beats baseline** — define baseline as the score of `baseRev` measured by the *same* command in the *same* sandbox (recompute, never reuse `claimedMetric`). For a metric where higher is better: `candidateScore - baselineScore > ε` with `ε ≥ 0` declared per objective (mirrors `auto-research/loop.ts` `delta > 0`; `ε > 0` to reject noise). For an error/cost metric, the inequality flips. **"Beats baseline" = strictly better than the same-rev re-measured baseline by at least ε on the named metric — not better than the producer's claim, not equal.**
3. **All regression locks pass** — every `latestLocks` entry returns `status: "passing"` under `gradeRun` (exit 0 ∧ substring present). One regression = reject.
4. **Code-trust gate green** — `factory/verifier.ts:verify` returns `{ ok: true }` (new tests fail on `baseRev`, full suite green, `tsc` clean), and `validateAgainstHoldout` passes.
5. **Clean kernel assess on merge** — `safety-client.ts:assess(mergeAction)` returns `risk: "allow"` (or an explicitly-approved `ask`); a `block` is terminal.

Reproducibility note: 2 and 3 are computed on the **same** `baseRev`-vs-patched pair in the **same** sandbox in one run, so a moving HEAD or a flaky environment can't manufacture a pass.

## What stays human / Rule-Zero gated

The verify rig (stages 1–6) is mechanical and can run unattended — that's the cheap-to-verify half, and it's safe because it produces only a *verdict*, never a host change. Three things never auto-execute:

- **Enabling untrusted intake at all.** Accepting code from outside the operator is a Rule-Zero event. Off by default behind an explicit, armed flag (pattern: `factory/merge.ts` `VANTA_AUTONOMY_ALLOW_MERGE` — "default OFF; silently lands one rung lower otherwise"). Standing up the intake queue is itself the go/no-go this card must stop and surface for.
- **The merge.** Even a fully-green candidate stops at `safety-client.ts:assess` + human approval before `mergeWorktreeBranch`, and only into a non-default branch. No green light auto-lands to `main`. (`factory/merge.ts:assessMergeRisk` already encodes armed ∧ safe-target ∧ low-risk; the pool reuses it and *adds* the human gate rather than removing it.)
- **Running candidate code unsandboxed.** If no sandbox backend is available, refuse (`sandbox/run.ts` error sentinel) — never the trusted-mode local fallback. The sandbox is the authorization that replaces the per-command approval prompt; without it, there is no authorization.

## Go / No-Go recommendation

**Conditional GO.** The asymmetry is real and Vanta is unusually well-positioned: every verify primitive already exists and is tested (`verifier`, `holdout`, `merge`-risk, `mem-eval`, regression locks, worktree isolation, the docker/sandbox seam, the kernel `assess` gate). The genuinely new, genuinely dangerous part is *one* thing — intake of and execution of untrusted code — and Rule Zero forbids building that without sign-off, which is exactly why this card is a spike.

So split the build:

- **Build now (no new trust surface, all upside):** a **closed-pool verifier** — same `{ baseRev, diff }` shape, but candidates come only from Vanta's own already-trusted producers (`auto-research`, the factory, delegated workers). This is `auto-research/loop.ts` generalized to (a) accept a *diff* rather than spawn the producer inline, and (b) run the accept-criteria grader of stages 1, 4, 5, 6 over it. It hardens the rig, wires the unused `holdout.ts`, and adds the eval/lock-immutability screen — zero exposure to outside code.
- **Gate behind explicit sign-off (the actual untrusted pool):** opening intake to unauthenticated sources + executing their code, even sandboxed. Do **not** ship in the first slice. Requires: hardened resource limits, a no-network sandbox as a hard non-fallback default, audit logging of every candidate via `safety-client.ts:logEvent`, and a DECISIONS.md entry.

**Smallest safe first slice:** the pure accept-criteria grader — a function `gradeCandidate(measured) → { accept, reasons }` that folds (beats-baseline ε ∧ all-locks-passing ∧ verifier-ok ∧ holdout-ok) into one fail-closed verdict, modeled on `factory/merge.ts:assessMergeRisk`, with the eval/lock-immutability path check added to the static screen. Pure, exhaustively unit-tested, no I/O, runs the rig over **trusted** candidates only. It moves the pipeline forward, proves the criteria are falsifiable, and touches zero untrusted-execution surface — so it needs no Rule-Zero sign-off to land.
