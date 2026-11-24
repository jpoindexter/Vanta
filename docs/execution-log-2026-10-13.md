# Execution log — 2026-10-13 (Desktop + agent reliability continuation)

Branch `claude/vanta-desktop-agent-rebuild-20261013`, stacked on `codex/librechat-shell-adapter-20261002` @ `92ee5c86`. Draft PR #63 (base is the stacked branch, not main). GitHub Actions disabled.

## Active outcome
Codex-like Desktop whole workflow on one runtime, with approvals that match what the user actually means. Selected milestone is NOT finished; verdict below is partial.

## Ledger
- Must: preserve shipped history; no push to main; no release/notarize/deploy; no Rust/MANIFESTO/factory edits; Actions stay disabled; no paid APIs.
- Done evidence: real Electron path executed, packaged candidate proof, installed copy, docs/roadmap/Trello agree.
- Installed app: `/Applications/Vanta.app` ASAR `e7016146…1fe` (unchanged; verified at start). CLI checkout `~/.vanta/app` @ `d2be37c3` untouched; three user-owned scripts hashed (keypaste.c `a2f36cd8…`, prepare-lisbon-map.py `c6b6e60b…`, unitype.c `d460f551…`).

## Completed units (commit → evidence)
| Unit | Commit | Executed evidence | Does not establish |
|---|---|---|---|
| Flat exact-action approval card + prompt-marker dash removed | e840f5a3 | real Electron source capture light+dark; 22 renderer tests; renderer typecheck | narrow width, VoiceOver, packaged app |
| Project-scoped remembered approvals, atomic saves | 94ab7d7d, 1a72405f | 450 permission/approval tests; typecheck | CLI/TUI end to end |
| Inner-approval lookup honors project rules (regression found by lead) | 18a20557 | red→green `saved-exact-choice-scope.test.ts`; `scripts/desktop-approval-persistence-proof.mjs` (Always allow, restart, new chat, no card; project B still asks) | packaged app, real provider tools, shell grants |
| Honest "Waiting for your approval" status; tab title follows first prompt | d9689756 | real Electron capture: status text and title read back | sidebar row still shows "New chat" until the store names it |

## Findings not yet fixed
- `shell_cmd` can receive a project-wide "Always allow" (every shell command in that project; kernel block still holds). Card now says so. Prefix-scoped grants are the real fix (matrix row 2).
- No Desktop surface to list or revoke remembered rules (matrix row 1). Existing global rules stay global until re-saved.
- A project-scoped Always outranks an unscoped Never for the same tool (specificity rule). Needs an owner decision.
- Raw CLI repair hints (`Repair: vanta tools why …`) show in Desktop failed-tool rows; needs a trace-label pass, not a regex.
- `long-session-navigation.tsx` already violates size gates (fn 161 lines, complexity 20); not touched.
- Model catalog lacks `gpt-6-astra` (present in the Codex catalog at pin 90f00bd8). Availability depends on the connected account; do not hardcode.

## Models / usage
Lead: Sonnet 5.5 (medium), no fast mode. Four Sonnet workers (security triage, upstream matrix, reliability, dependency), explicit model, no recursion. Actual token/dollar usage not exposed to the lead: unknown.

## Next exact action
Integrate the dependency worker's runtime bumps, then one packaged candidate proof (`desktop:pack` + chat-first and approval proofs) before any install.
