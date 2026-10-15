# Desktop operator dossier audit — 2026-08-26

## Verdict

The scoped Desktop implementation is locally green in source and in the signed
packaged application. It is not yet a shipped roadmap outcome: the required
first-use comprehension dry run with a person unfamiliar with Vanta has not
been executed.

No release, deployment, notarization, merge, checkpoint tag, or GitHub Actions
run was performed.

## Git boundary

- Base: `eca32af8a05b097e5a755a6ab4ae9e4c3e628c64`
- Implementation: `d5d22b128d35d9006d0bddf421a4ece43135d9d5`
- Branch: `codex/desktop-operator-dossier-20260826`
- Diff: 60 files, 898 insertions, 613 deletions
- Installed Vanta checkout: preserved and not updated
- Separate roadmap worktree: preserved and not updated
- Protected Rust, factory, and `MANIFESTO.md` paths: unchanged
- Hermes, Nightcode, local `.vanta` state, quarantine artifacts, and credentials:
  absent from the proposed payload

## Implemented behavior

- The workbench exposes one task-facing dossier above the conversation:
  `Outcome` plus a literal `Next` state for ready, in-progress, approval,
  recovery, and review conditions.
- The collapsed runtime strip exposes only task readiness and repair guidance.
  Model, provider, kernel, memory, throughput, and lifecycle telemetry remain
  available through `Runtime details`.
- Command/Ctrl+L focuses the composer without erasing its draft and places the
  cursor at the end.
- Command/Ctrl+Shift+M cycles access mode. Shift+Tab is no longer intercepted,
  so reverse keyboard focus follows the platform convention.
- Queue controls retain edit, reorder, steer, remove, retry, reconnect, and
  relaunch behavior. Metadata is at least 12 px and compact controls are 36 px.
- The shortcut help, smoke tests, generated production bundle, and 48-image
  visual proof matrix were updated with the behavior.

## Executed evidence

| Gate | Command | Exit | Result |
|---|---|---:|---|
| Focused component tests | `npm test -- --run desktop-app/src/global-shortcuts.test.ts desktop-app/src/task-dossier.test.tsx desktop-app/src/runtime-strip.test.tsx` | 0 | 3 files; 19 tests passed |
| Runtime typecheck | `npm run typecheck` | 0 | Passed |
| Renderer typecheck | `npm run desktop:renderer:typecheck` | 0 | Passed |
| TypeScript 7 compatibility | `npm run typescript:compat:test` | 0 | 1 test passed |
| Production build | `npm run desktop:build` | 0 | 1,651 modules transformed |
| Shell convergence | `node scripts/desktop-shell-convergence-smoke.mjs` | 0 | Command-L, dossier, approvals, layout, compact mode passed |
| Queue behavior | `node scripts/desktop-queued-turn-editor-smoke.mjs` | 0 | Edit, reorder, steer, remove, retry, reconnect, relaunch passed |
| Runtime disclosure | `node scripts/desktop-runtime-strip-smoke.mjs` | 0 | Draft preservation, lifecycle, evidence, compact overlay passed |
| Model/runtime clarity | `node scripts/desktop-model-runtime-clarity-smoke.mjs` | 0 | Ready, loading, unavailable, local, remote, mixed states passed |
| Visual proof | `npm run desktop:visual:proof` | 0 | 4 regression tests; 48 captures; no missing or orphan baselines |
| Signed packaged accessibility | `npm run desktop:accessibility:proof` | 0 | Source and packaged shell plus queue passed; zero serious findings |
| Full TypeScript suite | `npm test` | 0 | 1,555 files; 14,275 passed; 3 skipped |
| Rust tests | `cargo test` | 0 | 70 passed; inherited unused-method warning only |
| Architecture | `node --import tsx src/arch/cli.ts` | 0 | All 5 boundaries hold |
| Size baseline | `node --import tsx src/cli.ts lint --staged` | 1 | 19 inherited violations versus 21 at base; zero new violations |
| Semgrep | changed production source | 0 | 210 rules; 3 files; zero findings |
| Full secret scan | `scripts/secret-scan` | 0 | 2,172 commits plus tracked/nonignored snapshot; zero findings |
| Staged secret scan | `gitleaks git --staged --config .gitleaks.toml --redact --no-banner` | 0 | Zero findings |
| Roadmap graph | read-only canonical validation | 0 | 1,331 items; zero duplicates, missing dependencies, or cycles |
| Whitespace | `git diff --check` | 0 | Clean |

The size command intentionally remains nonzero because it reports inherited
debt in `App.tsx`, `chat.tsx`, `overlays.tsx`, and `runtime-strip.tsx`. This
change removes two violations relative to the base and introduces none. The
pre-commit hook was therefore used in documented warn-only mode after the exact
before/after comparison.

The older `retrack-roadmap.mjs --check` command is not a canonical validation
gate for this roadmap format and reported unsupported classification errors. It
did not write any files. The read-only canonical schema/dependency/cycle check
above is the applicable repository gate.

## Evidence boundary

Executed source and packaged proofs establish the implemented hierarchy,
keyboard behavior, queue controls, responsive geometry, and automated
accessibility checks on this machine. They do not establish that an unfamiliar
person understands the dossier on first use, nor do they constitute a release
or user-testing result.

## Remaining acceptance step

Run the first-use comprehension dry run with a person unfamiliar with Vanta and
retain the observed task, prompts, misunderstandings, and outcome. Only after
that evidence passes may this roadmap card be promoted and receive its
non-release checkpoint tag.
