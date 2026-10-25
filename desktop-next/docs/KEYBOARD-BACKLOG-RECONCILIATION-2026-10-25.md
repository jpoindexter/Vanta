# Keyboard/navigation backlog reconciliation — 2026-10-25

## Decision and authority

Owner: Jason. Decision: preserve the existing source checkpoint series and
continue only concrete dependency-ready keyboard/navigation repairs; do not
promote partial source evidence to whole-card, installed or release acceptance.
The product value is predictable navigation, retained context and lower input
burden in the existing chat shell, not another surface or test platform.

Current audit starts at d37dd56b on claude/desktop-integration-20261013. GitHub
matches local HEAD. At audit entry the index was empty; 77 original dirty entries remain.
This file is an evidence projection, not a new work database; roadmap.json
remains canonical. No shipped history, dependency or product status is changed.

## Observed source evidence

The stored reports were opened and their actual check labels/errors inspected,
not just their pass counts. They record execution at their dated checkpoints;
this audit does not re-run every earlier path or certify all of current HEAD.

| Journey / criterion | Executed evidence | Boundary |
| --- | --- | --- |
| Keyboard approval entry, both-way decisions, Reject/Allow once/Escape, exact focus return | KEYBOARD-APPROVAL-FOCUS-2026-10-24.md; stored report 40 checks, no errors | No normal-profile Always/restart proof |
| One timeline Tab stop, arrows/Home/End, Enter jump, keyboard latest return | KEYBOARD-TIMELINE-2026-10-24.md; 21 checks, no errors | No whole-history or installed certification |
| Prompt submission/model/visible/rail/durable order | PROMPT-ORDER-2026-10-24.md; nine checks, no errors | No arbitrary concurrent-window guarantee |
| Palette displayed choice, Enter, empty-result guard | PALETTE-SELECTION-2026-10-24.md; ten checks, no errors | Source, two local chats |
| Search Clear → continued query typing, draft/route retained | CHAT-SEARCH-FOCUS-2026-10-24.md; 15 checks, no errors | Not every SearchField caller |
| Find remains open across explicit split-pane focus/click, retained query/new draft/caret, hover guard | FIND-PANE-SWITCH-2026-10-25.md; 21 checks, no errors | Not browser/PDF/source-editor Find |
| Closing the document from Find input retains query and visible-chat search; Escape typing return | FIND-CLOSED-PANE-2026-10-25.md; ten checks, no errors | Source/private profile |
| Repeated Cmd+F followed by immediate typing keeps whole queries | FIND-FAST-REPEAT-2026-10-25.md; seven rapid plus ten adjacent close checks | Not all IME/rapid-input paths |
| Fresh bounded polite-log additions for identical replies; reduced-motion timeline/latest jumps | ANNOUNCEMENTS-MOTION-2026-10-25.md; 20 checks, no errors | DOM input is not audible VoiceOver; not whole-app motion |

Additional dated source checkpoints for history search, roster/collapse, rendered
document Find, overlay Escape and pane-close focus remain linked by STATUS and
the DN-13 supporting checklist. Their narrow scopes are unchanged.

## Remaining gates and disposition

| Gate | Classification / owner | Required evidence / authorized next action |
| --- | --- | --- |
| Renderer typecheck missing shared session-resume-active-turn.json | Resolved verification defect | Exact pinned upstream fixture restored; three timer-contract tests and exact-index renderer typecheck pass. No new timer behavior or whole-suite certification |
| Current packaged S1 and normal-profile remembered approvals | Owner-gated / outside this goal's install/account authority | Exact packaged execution and scoped same/different-project restart proof; source keyboard results cannot substitute |
| Audible VoiceOver, complete contrast/zoom/narrow/theme matrix | Unverified acceptance, partly owner/native | Supported actual app/AT evidence, not DOM assertions or historical older-renderer proofs |
| DN-29 stages 2/3 and visual sign-off | Explicit owner gate | Approved first surface and installed look; preserve uncommitted candidate, no autonomous token/style sweep |
| DN-22 remaining Google/OAuth/worker/parity decisions | Separate owner/backend work | Specific authority and retained per-item acceptance; not new keyboard scope |
| N=20 reliability loops | Owner-superseded historical requirement | HANDOFF sections 2/6 and COUNCIL order 5 forbid proof marathons; retain failure diagnostics, no statistical claim from one run |
| GitHub default-branch security | Important separate release risk | Last push reports 166 alerts; not repaired or certified by navigation checkpoints |

No new runtime defect is established by a missing acceptance report alone.
Do not manufacture another interface feature or arbitrarily repeat every proof
just to keep a goal active. Preserve owner gates and historical evidence.

## Executed verification repair

The original import is pinned in desktop-next/NOTICE.md at 6e7b83a2f1. Its
[shared fixture](https://raw.githubusercontent.com/NousResearch/hermes-agent/6e7b83a2f1/tests/fixtures/session-resume-active-turn.json)
was restored verbatim, not invented from the test expectations. Local and pinned
source SHA-256 both equal
05ebdc61124bd53f48abfa7dd1be0653ebec20eebf182e347c6f08cd80489300.
Existing MIT/NOTICE files are unchanged.

- Working tree and isolated exact-index candidate: three existing session.resume
  timer-contract cases pass; 145 other cases intentionally excluded.
- Exact-index renderer npx tsc --noEmit exits 0. This resolves the previously
  recorded missing-module gate, not the full application test suite.
- Eight focused generator tests pass. A new real-generator regression first
  failed, then passed: public headings retain the Desktop Next card while
  omitting internal provenance; an unsafe fallback fails before replacing output.
- Canonical inventory remains 1,364 records: 1,289 shipped, 63 parked, two
  Building, four Next and six Horizon. Only two Building notes/dates append
  current evidence; IDs, status, dependencies, Done clauses and shipped history
  are unchanged. Root roadmap, build order and website projections regenerated.
- No fresh Electron/native replay: this slice restores test data and planning
  projections, not runtime interaction code. Prior navigation reports remain
  dated evidence, not a fresh installed-app or VoiceOver claim.

## Review trigger and preservation

Proceed with conditions: exact ready fixes may continue; full release and
Desktop completion remain unproven. The fixture defect is resolved. Next review
requires a concrete dependency-ready defect or owner authority/evidence for the
gated acceptance paths, not another unbounded proof loop.

All original work must retain its bytes; no reset, stash, delete or add-all.
Latest verified recovery: announcements-final-20261025-PPy7Nl, complete history,
dirty patch and untracked archive. Restore only into a new empty directory.
No installation, profile/account/Mac setting, protected Rust/factory change,
main merge, PR edit, tag/release, CI enabling, paid service or recurring research.
