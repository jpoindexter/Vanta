# Self-repair architecture — how Vanta improves itself without breaking itself

**Goal:** Vanta can repair and improve any part of itself — "fix a broken leg without breaking the
whole app" — down to the kernel and core, **without** (a) breaking the running system or (b) editing
out its own safety guardrails.

The body metaphor is exactly right, and most of the body already heals itself (built today: O11
compartments + O10b autonomy ladder + the dark factory). The unsolved part is the **skeleton/kernel**:
how does the safety boundary evolve when the boundary is the thing that enforces safety?

## The one principle everything follows from

**A running safety boundary may never modify itself in place.** If the live kernel can rewrite the
live kernel, the boundary is advisory, not enforced — the agent could remove its own guardrails in
one step. So self-repair is tiered by how close a part is to the safety boundary, and the closer it
is, the more the change must be *proven safe by something that is not the thing being changed.*

## What already exists (don't re-derive)

| Layer | Tier (O11) | Today's mechanism | Autonomous? |
|---|---|---|---|
| Tools (`tools/*`) | limbs | dark factory: triage→plan→execute→verify→merge (L5, gated) | **Yes — the leg already heals itself** |
| Skills / memory / brain | reflexes/memory | background review writes skills; brain self-authors | Yes |
| Agent loop (`agent.ts`, providers, prompt) | brainstem | factory implements + verifies, **stops for human review** (cap L2) | Implement-only |
| Kernel (`src/*.rs`), factory, manifesto | skeleton | `is_protected_path` **hard-blocks** the agent; compartment cap 0 | **No — and that's the gap to close** |

Plus: the **verifier trust gate** (new tests must fail on old code, full suite passes, tsc clean,
no protected path touched, no existing test modified), branch isolation, and git rollback.

So "fix the leg" is DONE. The rest of this doc is the protocol for the skeleton tier.

## Safe kernel self-repair — the 5 layers

A kernel change is the dangerous case. It is allowed, but only through a protocol where the **old,
trusted kernel proves the new one is at least as safe before the new one ever runs live.**

1. **Propose, never apply in place.** Vanta may author a *proposed* kernel change on an isolated
   branch and build it as a SEPARATE candidate binary (`argo-kernel.candidate`). The live kernel
   binary is never overwritten by the agent. `is_protected_path` stays absolute for the running
   process — the agent writes a proposal, not the live boundary.

2. **Differential safety conformance (the old kernel judges the new one).** Before promotion, the
   candidate must pass a fixed **safety-invariant suite**: a frozen set of `(action → expected
   verdict)` cases encoding Rule Zero (destructive→Block, out-of-scope→Ask, protected-path→Block,
   credential/system→Ask, …). The gate runs every case against BOTH kernels and **rejects the
   candidate if it is more permissive than the incumbent on any safety case.** A kernel change that
   weakens the boundary fails automatically. (Strictly-more-restrictive is allowed; equal+new-coverage
   is allowed; weaker is never allowed.) This is the "can't edit out its own guardrails" guarantee.

3. **Blue-green swap with auto-rollback (so it can't break the system).** A promoted candidate starts
   as a **shadow process** on a temp port; it must pass `doctor` + ping + the live invariant suite
   within N seconds. Only then does the launcher cut traffic over and retire the old binary (kept as
   `argo-kernel.last-good`). If the candidate fails to bind/respond/conform → **automatic rollback**
   to `last-good`. The leg heals; if the new leg won't bear weight, you fall back to the old leg —
   the system never goes down.

4. **Human promotion for anything touching the safety contract.** Differential conformance can prove
   "not weaker on the cases we wrote." It cannot prove the *spec itself* is complete. So any candidate
   that modifies safety-relevant code requires an explicit human promotion (the highest autonomy rung
   — above L5). Non-safety kernel changes (a perf fix in the HTTP server, a log format) can promote on
   conformance alone. Classifier: does the diff touch `safety.rs` / `approvals.rs` / `is_protected_path`
   / the invariant suite? → human. Else → conformance + blue-green. **The classifier is itself
   safety-critical, so it FAILS CLOSED: unsure → treat as safety-touching → human promotion.**

5. **The immutable trust root (the fixed point).** Something must be unmodifiable or the whole scheme
   is circular. The irreducible root is small and human-only:
   - the **promotion authority** (the code that runs the conformance gate and performs the swap), and
   - the **safety-invariant spec** (the frozen `action→verdict` cases = the executable form of
     `MANIFESTO.md`'s Rule Zero).

   Vanta can improve *every other part of itself, including the kernel body* — but it cannot edit the
   rule that decides whether a kernel change is safe, nor the gate that enforces it. Immune-system
   analogy: the body rebuilds any cell, but "don't attack self" is not itself rewritable by the cells.
   `MANIFESTO.md` is already kernel-protected; the invariant spec is its machine-checkable twin.

## Why this answers the goal

- **Leg (limbs):** heals fully autonomously — already shipped.
- **Brainstem:** improves under review — already shipped.
- **Kernel/skeleton:** improves via propose → old-kernel-proves-new-is-not-weaker → blue-green swap
  with auto-rollback → human promotion for safety-contract changes. It *can* improve down to the core,
  and it *cannot* break the system (rollback) or weaken its own safety (conformance + immutable root).
- **ND/vision tie (F6 reliability/trust):** an agent that maintains and repairs itself without breaking
  removes the operator's vigilance burden — the same trust thesis as the kernel itself.

## New pieces to build (vs. what exists)

1. Safety-invariant conformance suite + differential runner (old kernel vs candidate). — the core new safety mechanism
2. Candidate-kernel build + blue-green shadow swap + auto-rollback in the launcher.
3. Safety-touching classifier (which kernel diffs require human promotion) — extends O11 to a "skeleton-propose" rung.
4. Promotion authority as the named immutable root (document + isolate it).

Captured as roadmap items `SR1`–`SR4`. Until built, the kernel stays hard-blocked (the safe default).
