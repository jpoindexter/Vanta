# PR 87 review follow-up — 17 November 2026

The independent automated review of commit `aacd43fa` found a real Capacitor
alignment gap: npm resolved core/iOS 8.6.2, but CLI and checked-in native Swift
files still selected 8.4.1. Opening Xcode does not perform native dependency
sync. See the [review finding](https://github.com/jpoindexter/Vanta/pull/87#discussion_r4592225619)
and [Capacitor's documented workflow](https://capacitorjs.com/docs/basics/workflow).

## Scoped correction and executed proof

- Pin `@capacitor/core`, `@capacitor/ios` and `@capacitor/cli` to exactly 8.6.2.
  Runtime core/iOS bytes were already 8.6.2; only their declarations and the
  development CLI/dependency graph change.
- Two focused alignment checks failed before the correction: declaration/CLI
  mismatch and the old Swift version. They now pass with the two existing
  archive/matcher checks (four passed in total).
- Fresh install with lifecycle scripts disabled; full runtime audit: zero;
  full runtime dependency tree: no reported problems. No global npm change.
- Real `npm run mobile:sync` built the renderer and updated the native manifest
  successfully using CLI 8.6.2. Generated web assets remain outside the commit.
- Real SwiftPM resolution selected official `capacitor-swift-pm` 8.6.2, revision
  `b945758eaf3f034cea377e3138a60611cb40a88b`. An independent remote tag lookup
  returned the same revision. The Xcode workspace lockfile exactly matches
  SwiftPM's generated resolution; no fabricated revision or stale origin hash.
- Full TypeScript typecheck and `git diff --check`: passed.

The host has Command Line Tools, not full Xcode. Native sync and SwiftPM
resolution do not prove an iOS compile, signing, simulator or device acceptance.
No signing/provisioning or owner application state is changed.

## Review/merge boundary

The existing Codex review is `COMMENTED`, not an approving review. GitHub still
requires one independent approving review, including last-push approval, with
admin enforcement enabled. The author is the only configured collaborator and
cannot approve their own PR. No alternate identity, access grant, protection
change, self-approval or administrative merge bypass is used.

The 212 active default-branch alerts remain until protected merge and GitHub
rescan. This review correction is not a merge or alert-closure receipt.

## Iris

This is a main-candidate iOS/tooling correction, not a change to the current
Mac Desktop delivery. The existing [Iris download](https://github.com/jpoindexter/Vanta/releases/tag/desktop-test-20261112.2)
is retained unchanged. No new Mac archive, installation or notarization is
claimed or needed for these native iOS metadata/development-tool changes.
