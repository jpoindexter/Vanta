# LinkedIn author binding — source acceptance, 2026-10-28

## Scope and reproduced cause

TRUST-03 T03-3 has bounded SOURCE acceptance. This is personal-profile,
text-only posting; no live LinkedIn account was read or mutated.

The posting tool previously requested fresh publication approval before
resolving the author, then used the credential loaded before that wait without
revalidation. Actual registered-tool/agent/unchanged-kernel replays reproduced a
publication request after a token change and a publication to a different author
after the author changed during approval. Thirteen added focused cases failed
before the repair.

## Repair

- Snapshot the existing profile environment and credential values; resolve the
  personal author before the fresh publication request.
- Bind the resolved author URN in both the approval action and exact preview,
  preserving audience, UTF-8 byte count, text hash and complete preview text.
  JSON quoting prevents author metadata from becoming terminal control text.
- After approval, reload and validate the credential, re-resolve the author,
  then reload once more to catch a token change during that identity request.
  Missing/expired/insufficient-scope credentials or token/client/author drift
  refuse publication. Submit only with the originally approved credential and
  author.
- Forward cancellation to the existing requests and stop before publication
  when it is already canceled. No policy, grant, kernel, token-store or public
  tool-schema changes; no new dependency.
- Retain the existing provider-confirmed versus readback-unverified distinction
  and no automatic retry after an ambiguous result. Extract only the existing
  submission/result mapping to keep the author-validation phase small.

The kernel's independent invocation gate remains unchanged and may precede
identity lookup. It is not the fresh publication decision. A declined publication
may now follow a read-only identity request, but never a publication POST.

## Executed evidence

Private packet: `linkedin-author-binding-20261028-F4iKZ3`.
Final summary: `summary-1793224571146.json`; all twelve source journeys pass.

The real conversation, registered `linkedin_post`, unchanged Rust kernel,
synthetic credential store and local LinkedIn HTTP fixture exercise:

- PUBLIC and CONNECTIONS: author resolved before fresh approval, matching
  author/audience/text sent exactly once, provider-confirmed but not readback
  verified.
- Publication denial, changed token, changed author, revoked credential, expired
  credential, cancellation and token change during identity revalidation: zero
  publication requests.
- Connection reset and missing provider post ID: one consumed request, unknown
  result, no next model call or automatic retry.
- Definitive HTTP403 rejection: one request, reported rejection.

All fresh publication previews contain the original author in action and detail.
Action receipts exclude the complete post body and synthetic tokens. The model
and approvals are controlled fixtures, not owner decisions or a live service.

28 focused tests across three files pass, including mutable credential references,
client/scope drift, original profile scope, pre-cancellation, durable replay and
existing provider outcomes. Native TypeScript passes. Strict size checks on all
three changed source/test files report no violations; all five architecture
boundaries pass. No full suite was run.

Retained harness corrections: the first before-repair server assertion interrupted
wrong-author recording; the corrected recorder captured both unsafe POSTs. The
first denied-case replay stopped at the independent invocation gate; the final
driver declines the fresh publication request and proves zero POSTs there too.

## Limits and next delivery

Source only: normal CLI e467a857 and installed agent14 are unchanged. No new
packaged/native approval-preview acceptance, live post, browser readback,
multi-process credential-store durability or full TRUST-03 authority acceptance.
Generic canonical unknown-result review/clearing and parent-card completion stay
open. Deliver the accumulated validated agent fixes before expanding source work
to the next delegated-outreach slice. No main merge, public release/tag, paid
service, owner-credential migration or legacy retirement.
