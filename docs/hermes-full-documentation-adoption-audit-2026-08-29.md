# Hermes full-documentation adoption audit — 2026-08-29

> Historical snapshot. The later
> [Hermes release-history adoption audit](./hermes-release-history-adoption-audit-2026-09-03.md)
> supersedes this document's roadmap counts and current ordering while preserving
> its 208-page documentation findings.

## Verdict

Vanta should adopt a small set of Hermes's current interaction and reliability
patterns, not its product identity or implementation wholesale. The complete
documentation review found one exposed Vanta trust boundary worth promoting to
Next, one dependency-ordered user-facing browser workspace worth adding to
Horizon, four useful patterns worth retaining as parked cards with measurable
re-entry triggers, and three existing cards that needed stronger acceptance
contracts.

This document changes roadmap intent only. It does not claim that any newly
described behavior is implemented, packaged, released, or externally verified.
No Hermes source, checkout, runtime, branding, assets, tests, credentials, or
generated files were copied into Vanta.

## Frozen source corpus

The review used Hermes's official machine-readable documentation exports rather
than sampling navigation pages:

- [Documentation index](https://hermes-agent.nousresearch.com/docs/llms.txt)
- [Complete concatenated documentation](https://hermes-agent.nousresearch.com/docs/llms-full.txt)
- Canonical documentation home: <https://hermes-agent.nousresearch.com/docs>

The downloaded snapshot contained 208 source pages:

| Documentation area | Pages |
| --- | ---: |
| Getting started | 7 |
| User guide | 113 |
| Guides | 35 |
| Developer guide | 35 |
| Reference | 13 |
| Integrations | 4 |
| User stories | 1 |
| **Total** | **208** |

Within the user guide, the largest groups were Features (51), Messaging (35),
Secrets (4), and Egress (2), plus 21 top-level product and platform pages.

Snapshot evidence:

| File | Lines | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| `llms.txt` | 248 | 39,220 | `5afe89d35f9dc05ee9b822b079a31677e426e97fc917d1d3fc1ffddd09d6a2c8` |
| `llms-full.txt` | 79,665 | 4,011,252 | `3d4f4747e08de50cf306afba4033ff81987b72a0b5a40beb4cf35dbcc8b52c97` |

The raw exports were stored outside the repository for analysis. Only this
Vanta-authored comparison and the resulting roadmap records belong in the diff.

## Method and evidence boundary

1. Inventory every source page from the complete export, including headings and
   the introductory contract for each page.
2. Deep-read the pages that could materially improve Vanta's user utility,
   trust boundary, continuity, setup, Desktop, TUI, browser, tool, document,
   sandbox, credential, and failure behavior.
3. Compare each candidate with current `roadmap.json`, the prior source-history
   comparison, and the supported Vanta code path where a claim depended on
   present behavior.
4. Strengthen an existing owner card when one already existed. Add a new card
   only when the outcome, owner, dependency, and Done evidence were genuinely
   distinct.
5. Keep the canonical open queue within Vanta's limits: at most 12 open, four
   Next, six implementation-ready, and two Building.

Documentation describes intended Hermes behavior; it is not independent proof
that Hermes executes every claim. Likewise, a roadmap edit is not proof that
Vanta executes the adopted contract.

## Adopt into the active build order

### `BROWSER-WORKFLOW-ACTION-BOUNDARY` — promoted to Next

Hermes documents an accessibility-snapshot browser model, stable references,
named sessions, live viewing, takeover, session cleanup, and real-profile
browsing. Vanta already has browser tools and a persistent dedicated profile,
but the current supported surface does not yet prove one exact effect contract
for every action variant:

- `browser_navigate` exposes click, fill, select, and scroll variants while its
  safety description is navigation-shaped.
- authenticated cookie extraction and ordinary read paths do not yet prove the
  same explicit, revocable account/profile authority contract;
- action risk still depends partly on selector/text classification rather than
  one normalized intent binding the exact target and payload;
- an allowed navigation must not become permission for a nested mutation.

The card now requires a single TUI/Desktop/workflow/tool-host boundary, exact
action and account previews, redirect/popup/frame/dialog/upload/download cases,
fail-closed settlement, no automatic retry of ambiguous effects, redacted
receipts, and one real packaged authenticated journey.

Relevant Hermes references:

- [Browser automation](https://hermes-agent.nousresearch.com/docs/user-guide/features/browser/)
- [Real-profile browsing](https://hermes-agent.nousresearch.com/docs/user-guide/features/browser#real-profile-browsing-use-your-own-logins)

### `BROWSER-AUTHENTICATED-WORKSPACE` — new Horizon card

After the action boundary, Vanta should expose its browser as a legible operator
workspace rather than a hidden Playwright process. The useful adoption is:

- headed Vanta-owned sign-in instead of copying the operator's live browser;
- named sessions and tabs with visible account/profile/domain ownership;
- accessibility snapshots and stable, expiring element references;
- watch, pause, human takeover, revoke, reset, idle TTL, crash cleanup, and
  restart ownership;
- no raw cookies, storage, credentials, or authorization headers in model
  context or receipts.

Direct live-profile copying is explicitly rejected until filesystem
permissions, browser locks, profile selection, Keychain behavior, revocation,
and a real packaged acceptance run are proven. Hermes's own documentation and
issue history make those edge cases material rather than theoretical.

## Retain as parked, trigger-driven work

### `SANDBOX-EGRESS-CREDENTIAL-BROKER`

Adopt the architecture described by Hermes's egress documentation, not its
vendor implementation: an untrusted sandbox receives an opaque scoped grant;
the host owns the provider credential, revalidates the upstream destination,
and injects the credential only for that request. Broker failure must fail
closed with no fallback to inherited environment variables.

This remains parked until a real sandbox task needs provider credentials or a
credential-exposure regression appears.

Reference: [Egress proxy](https://hermes-agent.nousresearch.com/docs/user-guide/egress/iron-proxy)

### `DOCUMENT-SCANNED-PAGE-RECOVERY`

Vanta's shipped bounded document reader intentionally excludes OCR. The useful
next layer is not automatic whole-document OCR: detect text-coverage gaps, name
the exact page ranges, and let the operator choose targeted local
render-plus-vision or bounded on-device OCR with page provenance and visible
limitations.

This remains parked until an actual document produces materially incomplete
page coverage.

Reference: [Document extraction](https://hermes-agent.nousresearch.com/docs/user-guide/features/document-extraction)

### `COMPUTER-USE-NO-FOREGROUND-SESSION`

Hermes documents background computer use that does not take over the user's
ordinary pointer and foreground focus. That is a meaningful Vanta goal, but it
requires an explicitly owned OS session, visible scope, short-lived element
references, capture-assess-act-verify, takeover, pause, and cleanup—not a hidden
input injector.

This remains parked until user testing shows foreground input theft blocks a
real workflow or the required OS/session architecture is separately authorized.

Reference: [Computer use](https://hermes-agent.nousresearch.com/docs/user-guide/features/computer-use)

### `TOOL-DISCOVERY-SCALE-QUALITY`

Vanta already ships automatic deferred tool search and role-based tool
surfaces. Hermes's staged manifest, lexical/BM25-style retrieval, parameter-name
matching, batched search, describe-before-call, and session-scoped catalog are
useful only if measured discovery quality warrants them.

The parked card re-enters at more than 500 effective tools, three observed
discovery failures, or worse turns/tokens than eager schemas. Its Done contract
requires success and top-k recall benchmarks at 100, 1,000, and at least 3,000
tools and preserves the underlying Vanta policy, approval, hook, receipt, and
revocation identity.

Reference: [Tool search](https://hermes-agent.nousresearch.com/docs/user-guide/features/tool-search)

## Existing cards strengthened, not duplicated

| Existing card | Documentation-derived correction |
| --- | --- |
| `HARNESS-UNIFIED-DEADLINE-FAILURE-CONTRACT` | Preserve exit code, terminating signal, timeout/cancel origin, stderr availability, descendant termination, blocked-event-loop deadlines, and poisoned-backend disposition. |
| `DESKTOP-CONNECTION-PROJECT-LIFECYCLE` | Make connection owner, transport, endpoint class, authorization, capability set, health, concurrent-stream isolation, and removal explicit. |
| `DESKTOP-NATIVE-RESILIENCE-SHELL` | Require system-browser OAuth with PKCE/state/nonce and loopback or explicit remote handoff; keep tokens out of renderer storage, process arguments, shell history, URLs, and logs. |

## Already covered in Vanta

The corpus did not justify duplicate cards for these Hermes capabilities because
Vanta already has shipped or explicitly sequenced owner records:

- provider setup, local/OpenAI-compatible models, routing, fallback, auxiliary
  models, credential pools, model controls, and Desktop/TUI selection;
- MCP, explicit-empty allowlists, plugins, skills, skill curation, hooks, LSP,
  ACP/API surfaces, tool search, and role-based tool surfaces;
- memory, compaction, checkpoints/rewind, session continuity, goals, loops,
  heartbeats, scheduling, kanban, batch/worker execution, and worktrees;
- Telegram and other messaging gateways, webhook delivery, attachments,
  deliverables, media, wake word, and notification surfaces;
- browser reading, web search, page extraction, PDFs/office documents, vision,
  clipboard/image context, and Desktop previews;
- Docker sandboxing, egress policy, environment scrubbing, secrets vault and
  rotation, approval stages, effect settlement, and protected-compartment
  boundaries;
- migration/import, profile distributions, cross-host settings, operator
  dossier, accessibility, cold-operator proof, and native Desktop resilience.

The existence of a shipped card proves only its retained card-level boundary;
it does not imply that every analogous Hermes option or every provider/platform
is supported.

## Explicit non-adoptions

The following documentation areas do not become Vanta roadmap work now:

- paid Nous Portal, managed tool gateway, cloud browser, residential proxy, or
  other hosted-service dependencies;
- CAPTCHA/stealth bypass, anti-detection promises, unrestricted raw CDP or
  arbitrary page JavaScript, or silent copying of a personal browser profile;
- Bot Mode, fleet/group-chat product identity, separate bot truth stores, or
  multi-tenant AI-company architecture;
- provider, messaging-platform, cloud-terminal, enterprise, MDM, SSO, billing,
  commerce, crypto, skins, pets, or cosmetic breadth without Vanta user evidence;
- a Python runtime, shell/code-execution shortcut, or external tool gateway that
  bypasses the Vanta kernel, approval, effect, credential, and receipt boundary;
- automatic installation of Hermes, Hermes plugins, Hermes skills, third-party
  egress code, branding, docs, tests, fixtures, or assets;
- releases, deployments, notarization, paid research, participant outreach, or
  GitHub Actions spend.

## Resulting sequence

1. Keep the two voluntary cold-operator cards as Next evidence work.
2. Fix `BROWSER-WORKFLOW-ACTION-BOUNDARY` as the urgent mechanical Next card.
3. Build `BROWSER-AUTHENTICATED-WORKSPACE` only after that boundary and its
   existing dependencies are green.
4. Re-enter the four parked adoption cards only when their recorded observable
   trigger occurs.
5. Preserve the broader `TRUST-03`, `TRUST-05`, and existing Horizon sequence;
   a browser boundary fix does not silently authorize unattended web autonomy.

After reconciliation the canonical roadmap contains 1,346 cards: 1,288
shipped, 3 Next, 9 Horizon, and 46 Parked. There are 12 open cards, which is the
configured capacity ceiling rather than an invitation to build them
simultaneously.
