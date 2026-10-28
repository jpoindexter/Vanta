# Draft ownership and runtime ledger — 2026-10-28 source checkpoint

Subsequent source update: the [live approval recovery checkpoint](live-approval-recovery-checkpoint-2026-10-28.md)
passes the full-renderer-reload criterion retained below. This file preserves the
earlier diagnosis and its exact evidence; installed acceptance remains separate.

The fresh-draft profile timing repair has executed source-Electron evidence.
Full pending-approval recovery after a renderer reload **still fails** and is the
next continuity repair. This checkpoint is not a new installed build, whole-card
completion, or whole-product/security acceptance.

## Behavior repaired

A profile pick publishes new-chat intent before its backend finishes activating.
The composer previously assigned that new draft to the old active profile. When
activation finished, the owner changed and an empty incoming draft replaced text
already typed. A metadata-only real-replay trace observed this exact transition.

Fresh drafts now use the selected profile immediately, matching session creation.
Stored-session ownership hints and complete explicit tile routes keep precedence;
unresolved, ambiguous stored ownership still fails closed. The existing legacy
connection fallback is unchanged: this does not establish connection-changing or
remote-override custody before activation.

## Modularization

The two runtime-event ownership maps and their cohesive operations move from
`session-states.ts` into a 70-line `session-runtime-ownership.ts` module. The
facade retains its lifetime, exports, durable-owner precedence, public/raw ID
distinction, synchronous preview update and cleanup behavior. Original marked
events, not spread copies, retain secondary-profile provenance. Profile-only
retirement does not erase a same-named exact remote owner.

The facade decreases from 3,153 to 3,120 physical lines. Its existing 25 size
findings remain; no new module or touched draft-file size findings are present.
This is one proven seam, not completed session/state/gateway modularization.

## Executed evidence

- Resolver regression: old behavior fails both null/key fresh-draft cases.
  The real draft-hook delayed-activation test also fails with the old resolver.
- Final focused run: 58 tests across seven relevant files pass, including
  draft text/attachments, cold fresh-handle restoration, source ownership and
  profile-only approval routing. No full application suite was run.
- TypeScript 6.0.3: six touched files plus options/global diagnostics report
  zero diagnostics. This is not a complete renderer typecheck.
- Fresh source renderer and Electron-main builds exit 0. Final source and
  renderer fingerprints are checked against the actual executed replay.
- Real source-Electron round 1: B waits at its actual approval card; switch to A
  and type an unsent draft; route, words, logical caret and focus remain unchanged
  across delayed activation/background waiting. Return to B's actual session row,
  click **Allow once**, observe exactly one append, then return to A and observe
  the exact retained draft. No direct approval POST substitutes for that click.
- The final replay observes zero renderer errors and closes every identified
  private app/backend/kernel process. Test homes and model are disposable;
  normal credentials, profiles and approvals are not copied.
- Independent code reviews found no high-confidence introduced regression in
  the bounded ledger extraction or profile timing repair. Review is distinct
  from the executed behavior above.

## Failed reload criterion — not waived

Round 2 reaches another real approval, then reloads the renderer. The card does
not return within the original 30-second observation. GET-only diagnostics prove:

1. The original observed runtime client still has the exact pending approval.
2. A different, actually observed new runtime client opens the same stored chat
   but reports no pending approval.
3. The saved route remains the same; the UI incorrectly presents Done while
   the original action is still awaiting a decision. The second append target
   does not exist: no automatic approval or retry occurred.

Code-path cause: the renderer-local client registry is lost on reload. Resume
creates a fresh client, opens saved history and returns `running: false`, without
recovering the live backend client. SSE closure itself does not cancel the old
approval. The next repair must validate exact backend runtime/stored-chat/owner
binding and reattach without replacing the active conversation, resubmitting a
prompt, or reusing approval authority. Merely persisting a client ID and opening
the running conversation again is not sufficient.

## Delivery and remaining boundaries

Installed signed/notarized agent9 and normal CLI source70f05035 remain unchanged.
No main merge, release/tag, CI, paid service, Rust/factory/policy edit or legacy
capability retirement occurs. Original uncommitted work and recovery material
remain separate from this source checkpoint. Roadmap/Trello notes record partial
evidence; statuses, Done criteria and owner gates are not promoted.

Owner visual/parity/human/live-account, complete draft/queue/attachment continuity,
reload approval recovery, native-control/voice, dependency security and remaining
modularization remain open. No native last-rung ledger or cross-host retirement
proof is inferred from the local durable-owner UI path.

Private evidence packets: `runtime-owner-ledger-candidate-20261028-o8i3GI`,
`runtime-owner-ledger-promotion-20261028-MoeJWP`,
`runtime-owner-ui-20261028-0mUqxp`, and
`draft-switch-triage-20261028-LejxF5`. Failed rehearsals, fixture corrections,
RED regressions and failed full-reload receipts are retained alongside passes.
