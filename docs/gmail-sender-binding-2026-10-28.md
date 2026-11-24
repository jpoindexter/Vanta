# Gmail sender binding — source acceptance, 2026-10-28

## Outcome

The source `gmail_send` and `gmail_draft` tools now bind their fresh approval to
the verified sender mailbox as well as the existing exact recipient, subject,
body preview and digest. This accepts the bounded **T03-1 source slice**, not
the whole TRUST-03 card or installed Gmail operation. Pinned CLI and packaged
Desktop delivery remain T03-4; live-account acceptance has not run.

The later [delivery-candidate checkpoint](gmail-delivery-candidate-2026-10-28.md)
records terminal and packaged chat evidence separately; this document retains
the original source-acceptance scope below.

## Reproduced causes and repair

Previously, both tools requested approval before resolving authentication, then
used `/users/me`. Switching the connected account during the decision caused a
submission with the new account's token. Two original gateway regressions failed
with that token. A second pair showed that a canceled turn could still submit
after an approval callback returned late.

One shared outbound helper now captures the environment and authorization,
obtains a token, verifies the Gmail profile, and names that sender in the fresh
preview. It rechecks the stored authorization after approval and checks turn
cancellation immediately before submission. The request uses the captured token,
an explicit mailbox URL and the same MIME From address. It never refreshes or
retries a consequential 401 response. Reads retain the existing Google client.
No new tool, dependency, scope request, policy or kernel/factory change was added.

Sender identification is a **read-only network preflight before approval**;
denial means zero message/draft submissions, not zero network requests. Current
Vanta Gmail consent requests `gmail.modify`, which supports profile lookup.
An incompatible token or unavailable/invalid sender profile fails closed rather
than requesting broader authority silently. Google documents the mailbox
[profile](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users/getProfile)
and explicit-email [send target](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send).

## Executed evidence

The real source registry, Google OAuth refresh/store implementation and durable
tool effect gateway ran against a loopback HTTP fixture. The Google auth library
retained its normal refresh logic; only its HTTP transport and the Gmail fetch
transport were redirected locally. Synthetic decisions stand in for human UI.
The store is private and file-backed; macOS Keychain behavior was not exercised.
No owner credential, external recipient or provider network was used.

| Executed path | Observed result |
| --- | --- |
| Approved send and draft | Each has one exact sender/content preview, one OAuth refresh and one submission to the explicit approved mailbox; exact MIME bytes checked. |
| Account switch during send/draft approval | Zero submissions; denied. |
| Authorization revoked during approval | Zero submissions; denied. |
| Denied approval or canceled send/draft with a late approval | Zero submissions; denied. |
| Reset after submission or unusable provider ID | Unknown, never automatically retried. |
| Submission HTTP 401 | Denied after one submission, without refresh or retry. |
| Four separate-process replays of confirmed/unknown operations | Zero network calls, zero approval calls and zero duplicate submissions. |

Final proof: **11 HTTP cases**, including four separate-process replays. Exact
hashes of seven source inputs matched the proof manifest. Receipt scans exclude
the complete body and fixture access/refresh/client secrets. This does not
establish arbitrary logging safety or live Gmail delivery/readback.

The six focused/architecture files pass **58 tests**. Runtime native TypeScript
exits 0. Strict size analysis reports zero violations across the six changed
source/test files; architecture rules and diff whitespace checks pass. Original
sender-switch and cancellation failures are retained. One intermediate HTTP
rerun reused settled fixture operation IDs and correctly skipped approval; the
final run uses fresh private scenario roots, retaining those earlier claims.

Local evidence packet: `gmail-account-boundary-20261028-1VpMjD` (not a public
repository attachment). It retains preimages, RED/GREEN logs, actual HTTP request
metadata, separate-process receipts and source hashes without owner data.

## Remaining boundaries

- Normal CLI and installed agent11 are unchanged. No Electron/real-TTY approval,
  owner Gmail, live provider acknowledgement or mailbox readback ran here.
- Cancellation cannot undo a request already started. Such uncertainty stays
  unknown. The existing OAuth refresh operation itself is not made abortable.
- The refresh-authority check is not a new transaction/revocation service. An
  account change after the last check cannot retarget the frozen request to a
  different mailbox; broader credential-store concurrency remains separate.
- Host draft recovery, review-clear behavior, quotas, delegation/recurrence and
  every other TRUST-03/OP-03 requirement remain open. No business workflow,
  autonomous outreach, main merge, release/tag or security completion is claimed.
