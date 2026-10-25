# Unified composer delivery — 2026-10-25

## Delivery boundary

Source `14fee24dd304626a23b1a3c144b33056847a4760` is committed and pushed to
`claude/desktop-integration-20261013`. Its exact signed candidate is version
`0.1.0-local.20261025.composer`, built `2026-10-25T18:37:33.389Z`.
Apple submission `2e9eae80-3e4f-403b-a71b-d0449ca5390a` is Accepted. The ticket
is stapled, and `/Applications/Vanta.app` now matches that exact candidate.
The guarded installer replaced only the stopped app and retained the previous
source `510e0450` bundle at
`/Applications/.vanta-install-backups/update-RfEW2D/Vanta.app`. Its adjacent
`receipt.json` binds previous and installed ASAR hashes. No owner app was quit
and no owner profile was launched.

Candidate and installed ASAR SHA-256:
`e42e4bf2a450f8198746787a3e1a82891d43e080cbda51f282a2a808655c4f84`.
The package has 247 staged runtime packages and no escaping runtime symlinks.
Installed deep/strict signature and staple validation pass; Gatekeeper accepts
the app as Notarized Developer ID.

Fresh post-staple local ZIP:
`Vanta-deliveries/2026-10-25/Vanta-0.1.0-local.20261025-composer-notarized-arm64.zip`,
SHA-256 `969610422dd70091621be789875e0f16ed3d17bf5db4aa109e9403d890eceb31`.

## Actual candidate checks

- **22 composer checks pass:** Home and conversation, light/dark, shared radius,
  inset, layered shadow, control size and maximum width; editor/button focus;
  real project-menu open/Escape/focus return; 800px layout and 125% native zoom;
  forced-colors cue; real Home send exactly once and ordinary chat reply.
  Two loopback model requests and zero renderer errors. Only the native project
  folder chooser is supplied a private fixture; project creation uses the real
  UI and store.
- **10 recovery/queue steps pass:** all three live failed-turn recovery actions,
  queue edit/reorder/remove, cold restart with no automatic replay, explicit Run
  queue, exact execution order and second-restart transcript. Fifteen scripted
  model requests, zero errors across restarted windows.
- **13 ordinary chat/approval steps and seven probes pass:** remembered
  project-scoped permission through restart/new chat, cross-project asking,
  Plan-mode write refusal, irreversible actions still asking, 200KB paste,
  image submission/chip clearing and responsive layouts. The existing blocked
  vibration warning is retained; it is not a renderer exception.

Evidence is retained privately in
`Vanta-backups/composer-unification-20261025-Uu35Ad/`:
`packaged-appearance-1792953729021/`, `candidate-recovery/` and
`candidate-done-path/`. Source checks and the previous failed attempts remain
in [COMPOSER-RECOVERY-2026-10-25.md](COMPOSER-RECOVERY-2026-10-25.md).

## Separate installed replay

The actual `/Applications/Vanta.app` independently passes the same 22 composer
checks (two loopback requests, zero renderer errors) and all ten recovery/queue
steps (15 scripted requests, zero errors across restarted windows). These use
isolated profile data, not the owner's account or history. Installed evidence:
`packaged-appearance-1792954031293/` and `installed-recovery/` in the same
private checkpoint. The ordinary installed chat/approval replay separately
passes all 13 steps and seven probes; `installed-done-path/` retains its evidence
and the existing blocked vibration warning. Candidate and installed behavior
were each executed, not inferred from matching file hashes.

## Preservation and scope

The complete-history `verified-source-14fee24d.bundle` verifies successfully.
Stopped owner userData is privately backed up; the owner profile was not
launched. Of the original 273 work-file hashes, 271 are unchanged. Only the two
owner-approved composer styles deliberately differ; their exact previous bytes
are retained. Eleven unrelated dirty tracked files and original untracked work
remain untouched.

This applies the approved composer using the existing Vanta theme and shared
primitives. It does not claim a whole-app redesign. Astryx has not been installed;
its isolated primitive/portal compatibility check and other surfaces remain
open under [the unified design contract](UNIFIED-DESIGN-2026-10-25.md).

Unsent-image restart custody, cold-restart failed-run metadata, unread/reading
position, HUD/inline geometry, full contrast, audible accessibility, owner visual
acceptance, live accounts and physical hardware are not certified here. The
separate native draft/queue work remains isolated and unintegrated. Dependency
security is not green. No full suite was run, and no main merge, release/tag,
paid service, CI activation, owner-gate bypass or broad card closure occurred.
