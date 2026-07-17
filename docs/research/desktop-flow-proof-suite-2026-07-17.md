# Desktop flow proof suite

Date: 2026-07-17

Roadmap card: `DESKTOP-FLOW-PROOF-SUITE`

## Outcome

Vanta now has one release-level desktop acceptance command. It builds and signs the current ARM64 `Vanta.app`, then runs the same Playwright/Electron flow matrix against source Electron and the packaged executable.

The matrix proves:

- cold start and one useful task;
- inline allow/reject approval and all three project access modes;
- failed-run partial output, edit, checkpoint, and retry recovery;
- project-context attach, search, remove, and submitted `@path` references;
- archive failure feedback, archive Undo, Trash restore, and bulk session actions;
- Outputs, capabilities, messaging setup, provider setup, queue, and stop;
- contained desktop layout at `1440x960`, `1024x640`, and `760x700`.

## Executed proof

```bash
npm run desktop:renderer:typecheck
npm run desktop:flow:proof:source
npm run desktop:flow:proof
```

The full command built `release/mac-arm64/Vanta.app`, signed it with the installed Developer ID identity, passed strict deep code-signature verification, and emitted a final JSON receipt with `ok: true` for both `source` and `packaged` targets. Each target passed `shell`, `work-recovery`, `attachments`, `sessions`, and `outputs-connect`.

During repeated source proof, a real access-mode race was exposed: a stale aggregate refresh could replace a newly saved mode, and the trigger depended only on delayed parent props. The data hook now discards invalidated refreshes, while the picker updates optimistically and rolls back on a failed save. The shell proof then passed three consecutive runs before the complete source and packaged matrix was rerun.

## Boundary

This suite proves deterministic local fixtures and the signed packaged application. It does not notarize a new DMG, exercise a live paid model provider, or validate external messaging credentials.
