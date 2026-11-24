# Blocked-action recovery — narrow defect

Canonical ID: `DESKTOP-BLOCKED-RECOVERY-GUIDANCE`.
Trello: [Explain blocked actions and avoid duplicate failed replies](https://trello.com/c/AKRLbUGC).
Status: source regression reproduced; candidate acceptance pending.

## Observed and reproduced

The owner screenshot shows two generic blocked cards, Details containing only
`blocked`, and an Edit request button without useful next-step guidance. The
private conversation, résumé and contact information are not copied here.

A synthetic queue-settlement fixture reproduces two failed assistant receipt
rows when the first pause-for-effect-review write fails after a receipt was
attached. This establishes one duplicate mechanism, not the screenshot cause.

The Desktop live projection ignores the explicit `needsEffectReview` flag, and
the saved projection strips it. Both therefore show a generic block. A failing
live/reopened projection regression reproduced this loss before the source edit.

## Smallest change and safety boundary

Carry the typed boolean through both receipt projections. Give uncertain effects
a specific localized error code and practical instructions: expand the used
tools, check the destination app/site, do not repeat the action without knowing
its result, then edit the request to describe findings and the next action.
Queue continuation remains paused. Only an already-offered Edit request is kept;
retry, replay and checkpoint restart remain unavailable.

Bind exception settlement to the exact current-instruction assistant row rather
than blindly appending another receipt. Never deduplicate historical failures or
discard partial output. Clear that binding before starting a queued successor.

## Proof of Done and current limits

- Show the specific card live and after reopen in the actual candidate.
- Execute Edit request and confirm it edits without submitting or replaying.
- Inject the settlement failure: retain one current-run failed row, older
  independent failures and the uncertain-effect fence across persistence.
- Confirm no unknown action or queued follower is retried.

Executed source evidence: the new live and reopened projection checks first
failed with generic `blocked`/incorrect retryability, then passed. The four
focused Desktop files passed 103 tests, including the actual Thread component:
the reopened card renders the guidance, Edit request opens the saved instruction,
and no reload is invoked. The backend fixture first failed with two terminal
rows, then 25 focused controller/effect/ownership checks passed with one row,
persisted receipt, independent-history preservation and queued-successor
protection. Desktop renderer/Electron and runtime typechecks passed.

## Executed package proof

The [normal Desktop v0.1.0 release](releases/desktop-v0.1.0.md) includes this
repair. In its final extracted ZIP, one seeded uncertain-effect card displayed
the specific guidance. Edit request opened the exact original instruction with
zero model requests and no retry/checkpoint controls. The guidance remained
after actual quit/relaunch; zero renderer errors were captured. The fixture
executed no external action. This does not identify the owner's screenshot
cause or establish recovery for every provider outcome.

Focused source tests alone are not installed-app acceptance. No owner history is reset,
no safety policy is relaxed, and no automatic retry or extra outbound action is
authorized. The attachment-triggered failure remains separately open; see
[attachment regression](desktop-chat-image-regression-2026-11-17.md).
