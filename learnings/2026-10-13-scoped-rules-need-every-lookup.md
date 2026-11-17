# Scoping a saved rule means scoping every lookup of it

Date: 2026-10-13 · Area: approvals / permissions

When "Always allow" changed from machine-wide to per-project (`PermRule.root`), the worker updated
the main decision chain and both save paths and its tests passed. A second, private lookup
(`savedExactChoice` in `agent/execution-context.ts`, used by inner approvals such as `edit_file`)
still called `matchRule` without a root, so project rules silently never matched there — the exact
"it keeps asking" symptom the change was meant to fix.

Why the tests missed it: they drove the outer kernel-ask path, not the inner approval.

How to apply: after adding a field that changes matching semantics, `rg` every caller of the match
function (not only the ones the change touched) and add a test per lookup site. A caller that omits
the new argument fails closed (re-prompts), which looks like "works, but annoying" — easy to ship.
Verify with the real app: save, restart, new chat (`scripts/desktop-approval-persistence-proof.mjs`).
