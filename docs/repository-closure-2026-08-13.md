# Vanta repository closure audit — 2026-08-13

## Verdict

The consolidated Vanta branch is locally integration-ready for review, not
merged or released. It combines the current `main` ancestry with the verified
realignment, trust, continuity, operator-spine, provider/model, TypeScript 7,
TUI, Telegram, queued-message, paste, question-navigation, Scrapling, hygiene,
and documentation work. GitHub Actions remain disabled.

This record is deliberately not a shipment claim. `main` still requires an
independent approving review, eleven external acceptance gates remain open,
and the documentation build retains one upstream `image-size` advisory that
npm expands into nineteen high-severity dependency entries.

## Git boundary

| Field | Value |
|---|---|
| Repository | `jpoindexter/Vanta` |
| Base | `origin/main` at `4911ae44bbb35beef4511ba298475ba5a82b7e1c` |
| Closure branch | `codex/repository-closure-20260813` |
| Pre-audit head | `501825de` |
| Intended review base | `main` |
| Intended non-release tag | `checkpoint/vanta-repository-closure-2026-08-13` |
| Direct `main` update | None |
| Force-push/history rewrite | None |
| Merge/release/deploy/notarize | None |

The branch began as an isolated worktree from current `origin/main`, advanced
through the existing OP-01 stack without rebasing published history, then added
scoped closure commits. The pull request and annotated tag bind the final full
SHA after this document is committed, avoiding a self-referential hash.

## Preserved work

The dirty source checkout was not reset or overwritten. Its Scrapling patch and
four unrelated untracked Desktop-organizer scripts were preserved outside the
repository before reconciliation.

| Backup | SHA-256 |
|---|---|
| `vanta audit/repository-closure-20260813/scrapling-working-tree.patch` | `b883709c6c5b759449814151c0054e94b7828538695af13ae4ca1ac828ae2844` |
| `vanta audit/repository-closure-20260813/untracked-user-scripts.tar.gz` | `48e380163344cd82d834f6a23daf305c08d09d537599ff5944ea7baf10692e` |

None of the four unrelated scripts entered this branch. No checkout was moved,
cleaned, stashed, or deleted.

## Reconciled product state

- `TRUST-01`, `TRUST-02`, `TRUST-04`, `UX-03`, and `OP-01` retain `shipped`
  only with their checked local receipts.
- `roadmap.json` remains canonical: 1,331 unique items, 1,286 shipped, 38
  parked, one Next, and six Horizon. `GROW-01` is the sole Next item.
- The generated public roadmap reports zero Building, one Next, twenty recent,
  fourteen external-proof, and six Horizon cards.
- The repository exposes 148 tools and 155 commands in the regenerated public
  reference.
- External acceptance is still 0/11. No live account, participant outreach,
  paid research, real-money, publication, or deployment action was performed.

## Closure additions

- Consolidated Telegram setup/repair so TUI commands remain in-session while
  the explicit shell wizard owns hidden token entry and verification.
- Consolidated multiline paste, question-navigation, queued-message visibility
  and editing, active-provider model controls, compact Desktop model settings,
  launcher dependency repair, and compatible dependency updates.
- Added the guarded Scrapling MCP connector and upgraded the isolated local
  runtime to Scrapling 0.4.14 with MCP 2.0.0. HTTP, browser, and stealth
  extraction all returned the expected `Example Domain` result.
- Added six Vanta product-validation playbooks and a repository-owned complete
  history/current-snapshot secret scanner.
- Made browser approval tests deterministic, refreshed the checked TRUST-01
  effect surface, and taught that inventory to detect injected `this.http(...)`
  network calls.
- Bounded TTFT first-paint observation so a missing paint fails with recent
  process diagnostics rather than hanging.
- Recorded rule-specific Semgrep rationale for three old false positives whose
  denial/allowlist behavior is covered by focused integration tests.

An older first-frame optimization from PR #10 was deliberately not carried
forward. In the current app it marked the conversation ready before provider
and project status existed, broke the compact model popover, and could create an
empty-root interaction window. The current safe readiness contract was kept.

## Executed local evidence

| Gate | Command or path | Result |
|---|---|---|
| Canonical TypeScript suite | `npx vitest run --testTimeout=60000 --maxWorkers=4` | 1,529 files; 14,066 passed; 3 skipped; 0 failed |
| Browser approval boundary | focused Vitest | 7/7 passed after test-local browser-run isolation |
| Runtime typecheck | `npm run typecheck` | exit 0 |
| Renderer typecheck | `npm run desktop:renderer:typecheck` | exit 0 |
| TypeScript 7 compatibility | `npm run typescript:compat:test` | 1/1 passed |
| Startup compile | `npm run startup:compile` | exit 0 |
| TUI model settings | `npm run tui:model-settings:proof` | live launch, Ultra effort, Fast speed, overlay, and status passed |
| TUI question navigation | `npm run tui:question-navigation:proof` | Other, next, arrow navigation, selection, and response passed |
| OP-01 spine | `npm run op-01:proof` | Desktop/TUI digest matched; exactly-once effect receipt verified |
| TRUST-01 ledger | `npm run trust:effect-ledger` | 15 production sources, 409 surface sources, 1,075 primitive calls, 0 unmediated |
| TRUST-04 host ledger | `npm run trust:host-ledger` | 2/2 mutation checks passed; seven hosts present |
| Desktop source interaction | `npm run desktop:model-settings:smoke` | compact/visible, keyboard reachable, Codex effort/speed and Claude hiding passed |
| Desktop package | `npm run desktop:pack` | signed local app assembled and validated; no notarization or distribution |
| Packaged model interaction | `VANTA_DESKTOP_APP=... node scripts/desktop-model-settings-smoke.mjs` | passed |
| Packaged queue interaction | `VANTA_DESKTOP_APP=... node scripts/desktop-queued-turn-editor-smoke.mjs` | enqueue/edit/reorder/steer/remove/retry/reconnect/relaunch passed |
| Packaged continuity | `VANTA_DESKTOP_APP=... node scripts/desktop-continuity-restart-proof.mjs` | three launches; re-entry, refusal, receipts, and accessibility passed |
| TTFT deterministic checks | `node --test scripts/lib/ttft-performance.node-test.mjs` | 5/5 passed; no live-provider benchmark claimed |
| Rust | `cargo test --quiet` | 70/70 passed; one inherited unused-import warning |
| Roadmap schema | focused Vitest | 16/16 passed |
| Roadmap dependency graph | duplicate/missing/self/cycle checker | 1,331/1,331 unique; no graph errors |
| Roadmap generation | `npm run gen:roadmap` | exit 0; canonical projection regenerated |
| Runtime dependency audit | `npm audit` | 0 vulnerabilities across 768 dependencies |
| Documentation build | `npm run build` | exit 0 |
| Documentation dependency audit | `npm audit --json` | 19 high, all cascading from unpatched `image-size`; 0 critical |
| Complete secret scan | `./scripts/secret-scan` | 3,022 commits and 21.31 MB snapshot; 0 findings |
| Tracked source SAST | Semgrep TypeScript/security rules, excluding generated Desktop bundles | 3,550 tracked JS/TS sources; 292 rules loaded, 89 applicable; 0 findings |
| Generated bundle review | extended-timeout Semgrep plus source inspection/tests | one `dangerouslySetInnerHTML` heuristic in the minified bundle; reviewed as a generated false positive because `safeMessageHtml` HTML-escapes literals and rejects unsafe link schemes |
| Protected paths | diff against `origin/main` | no root Rust, factory, or `MANIFESTO.md` changes |
| Forbidden content paths | diff/history scan | no foreign checkout/source, Nightcode path, `.vanta`, quarantine, credential, or unrelated organizer script |
| Whitespace | `git diff --check` | exit 0 |

The full TypeScript suite and complete secret scan are rerun after this audit
document is finalized so the pull request and checkpoint report the exact
review head rather than a nearby code head.

## GitHub controls

- Repository: public, MIT, default branch `main`.
- GitHub Actions: disabled. No workflow was enabled, dispatched, or awaited.
- `main`: force-push disabled, deletion disabled, linear history required,
  conversation resolution required, admins included, stale approvals dismissed,
  one approval required, and the last pusher cannot self-approve.
- The closure is published as one draft PR. Superseded Vanta-only stack and
  dependency PRs can be closed only after the live closure ref is verified.

## Remaining gaps

1. A different human must approve the final PR before protected `main` can move.
2. The documentation toolchain needs an upstream patched `image-size` release;
   npm currently offers no non-breaking fixed version.
3. Eleven external acceptance receipts remain absent. They require separate
   live-account/device authority and do not block local source review.
4. This branch does not create a release, update the public DMG, deploy docs,
   contact participants, or claim customer value.
