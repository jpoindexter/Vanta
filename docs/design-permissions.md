# Design — VANTA-PERMISSIONS (in-session allow/ask/deny rules)

Status: **designed, ready to build** (2026-06-10). The #1 rock per `~/Desktop/vanta-relevant-roadmap-priorities.md`. Build it as ONE vertical slice in a fresh session — it can't ship in pieces (a rule list that doesn't enforce is a stub).

## Goal
Let Jason tune persistent allow/ask/deny rules in-session, layered on top of the Rust kernel — *without* weakening the kernel's hard blocks. CC's `/permissions`, adapted to Vanta's kernel-is-the-boundary model.

## The load-bearing invariant (security)
**Rules may TIGHTEN, never LOOSEN.** The kernel's `assess()` verdict is the floor:
- Kernel `Block` → **always blocked**, no user rule can override (this is the whole safety story — do not let a rule turn a Block into Allow).
- Kernel `Ask`  → a user `allow` rule may auto-confirm it; a user `deny` rule blocks it; a user `ask` rule (or no match) keeps the prompt.
- Kernel `Allow` → a user `deny`/`ask` rule may *escalate* it to blocked/prompted; an `allow` rule is a no-op.

So effective decision = `tighten(kernelVerdict, userRuleAction)`. Pure function, exhaustively unit-tested against every (verdict × action) pair — this is the test that matters.

## Where it lives
Pure TS layer on top of the kernel (no Rust change). The kernel still runs first; the rule layer adjusts the *post-verdict* decision in `dispatchTool` (where `assess()` → block/ask/allow is already handled, see `vanta-ts/src/agent.ts` / `agent/dispatch-helpers.ts applySafetyGate`).

## Pieces
1. **`permissions/rules.ts`** (pure):
   - `type PermRule = { action: "allow" | "ask" | "deny"; tool?: string; pattern?: string }` (pattern = glob/substring on the safety descriptor — the same string `describeForSafety` produces).
   - `matchRule(rules, toolName, descriptor): PermRule["action"] | null` — first match wins; tool+pattern both optional (a bare `{action:"deny", tool:"shell_cmd"}` denies all shell). Specificity order: tool+pattern > tool > pattern > none.
   - `tighten(kernelVerdict: "allow"|"ask"|"block", ruleAction: action|null): "allow"|"ask"|"block"` — the invariant above. THE security test surface.
2. **`permissions/store.ts`**: load/save `~/.vanta/permissions.tsv` (`action\ttool\tpattern`), via the `~/.vanta` store (auto-commits like other store writes). Pure parse/serialize + thin fs.
3. **`repl/permissions-cmd.ts`** already exists (`/permissions` handler ignores ctx today) — extend it: `/permissions` lists rules; `/permissions allow|ask|deny <tool> [pattern]` adds; `/permissions remove <n>` deletes; persists via the store. Add to catalog if not present.
4. **Enforcement wiring** in the dispatch safety gate: after the kernel verdict, compute `tighten(verdict, matchRule(loadRules(), name, descriptor))`; act on the tightened decision (block → refuse; ask → requestApproval; allow → run). Load rules once per turn (cache), not per call.
5. **Doctor surface**: reuse the shadowed/unreachable idea later (a rule shadowed by a broader earlier rule) — out of scope for v1.

## Test plan (the gate)
- `tighten()` over the full 3×4 matrix (verdict × {allow,ask,deny,null}) — assert Block is immovable.
- `matchRule` specificity + first-match.
- store round-trip.
- `/permissions` add/list/remove via executeSlash.
- An integration test through the dispatch gate: a `deny` rule blocks an otherwise-Allow tool; an `allow` rule auto-confirms an Ask tool; a rule can NOT unblock a kernel Block.

## Risks
- The one that matters: a bug letting a rule loosen a Block. Mitigation: `tighten()` is a tiny pure fn with an exhaustive matrix test; the kernel Block branch returns block unconditionally before consulting rules.
- Rule-load perf: cache per turn.
- Scope creep into VANTA-AUTO-MODE (auto-approve) — that's a SEPARATE card that builds on this; don't fold it in.

## Why not done this session
Security-critical + multi-file; correctness here matters more than speed. Build it fresh with `/planmode`, not at the tail of a long thread. Once shipped, VANTA-AUTO-MODE and VANTA-PERM-PER-TOOL-UI unblock.
