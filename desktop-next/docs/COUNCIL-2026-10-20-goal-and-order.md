# Council: goal and card order (2026-10-20)

Method: llm-council skill. Five lens advisors (Contrarian, First Principles, Expansionist, Outsider, Executor), then five anonymized reviewers. All same-model, so this is corroboration, not proof. A council verdict does not authorize implementation.

## Goal (one sentence)

Done = the owner runs installed build 6 as the only Vanta for one real task, with a real model reply and a real Claude Code or Codex worker run through the app, and the evidence is a transcript that a mock cannot produce (non-mock model id in the run, worker exit 0 with a diff in a scratch repo).

Time-box: two working days on real-run failures. If still failing, revert to build 5 and make the failure the whole week.

## Order

0. Safety first (done 2026-10-20): `Application Support/Vanta` copied and build 5 copied to `~/Documents/GitHub/docs/Vanta-backups/` (outside the repo, because the auto-checkpoint would commit 552 MB).
1. Real model turn plus real worker run, on installed build 5 or the dev bundle first. That separates "the rebrand broke it" from "it never worked". Scratch repo, approvals on, spend cap.
2. Ship build 6 (sign, notarize, install). Re-run done-path on the installed app. Owner must be out of the app.
3. DN-DEP security triage plus a secrets and brand scan of the checkpointed diff (public repo).
4. DN-14 cutover and DN-33 plan card: ask the owner for both on day 1 so the wait is not on day 3. Build after step 1 passes.
5. DN-13: keyboard-only a11y walk and claim ledger in PR #66 only. No snapshot marathon.

Parked: DN-29 stage 2 (1.5-2 days, regression-prone, no user value yet), DN-19, board hygiene (one batch pass if there is slack). Close DN-20: its premise ("keep every Hermes feature") was reversed.

## Where the advisors disagreed

- DN-DEP: Contrarian and Outsider rank it 3-4 (public repo); Executor parks it. Kept at 3 because the repo is public and the diff is 2,842 files.
- Cutover: Contrarian puts it last (after days of use); the rest put it 3rd. Kept after step 1, owner-gated.

## What the reviewers added that no advisor said

- Run the real turn before build 6, not after (cheapest failure first).
- Packaged apps launched from the Dock do not inherit the shell PATH, so spawning `claude` or `codex` is the likeliest packaged-only failure.
- Provider auth was never exercised by the mock-model done-path, so 20/20 says nothing about it.
- A signing or bundle-identity change can make safeStorage secrets undecryptable.
- First real worker run: scratch repo, approval gate, spend cap.

## Open facts (checked 2026-10-20)

- Vanta app is not running; build 5 is installed. Build 6 is unblocked.
- Owner machine: `claude` and `codex` CLIs on PATH; Ollama has only `nomic-embed-text` (no chat model); `~/.vanta/credential-pools.json` has 0 credentials.
- So a real model turn needs a decision from the owner (see the STATUS note).
