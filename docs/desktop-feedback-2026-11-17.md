# Desktop private feedback and composer-edge checkpoint

Owner: Jason. Source branch: `codex/desktop-feedback-20261117`.
Cards: [private feedback](https://trello.com/c/53gGIrdJ),
[composer edge](https://trello.com/c/f6rmJwTU),
[Desktop updates](https://trello.com/c/CuF31GKo), and
[image-send recovery](https://trello.com/c/nm0VTKua).

## User flow

Help → Send feedback, or Settings → About → Send feedback opens the same
bug/idea dialog. Add a title, description and optional steps; review the exact
report; explicitly Send privately. Copy report is a local fallback.

Drafts remain on this desktop installation after dismissal and restart. They
are not part of a chat or profile. App/platform/Node/Electron version facts are
optional and off by default. Conversation content, account identifiers, file
paths, screenshots, raw logs and credentials are never automatically gathered.
The person can still type private text, so the form explicitly warns against
passwords and secrets and previews exactly what will be shared.

Before sending, a retry copy with a UUID is persisted locally. A network failure
or unconfirmed receipt locks that exact report for explicit same-ID retry.
No automatic retry occurs. Server-side digest binding and an atomic insert
prevent concurrent duplicate notifications; a reused ID with different content
is rejected. A matching stored receipt means the private receiver has the
report. Email-service acceptance does not prove inbox arrival. An uncertain
notification is not automatically resent. Closing the dialog after Send does
not undo a submitted report.

## Private service

Owner explicitly approved a separate receiver, EU database and one clearly
labelled synthetic test report, using the existing verified destination and no
paid-plan change. Heel was read-only: its schema, draft, receipt and retry
implementation informed this port, but its service and database were not
changed or reused for Vanta.

Vanta endpoint: `https://vanta-feedback.jason-poindexter.workers.dev/reports`.
The `vanta-feedback` D1 database is EU-jurisdiction, without read replication.
Delivery is fixed server-side to `jason@theft.studio`; no service credential or
recipient selector enters the Desktop. The public endpoint accepts submissions
without a tester account, but exposes no report-reading API. Rate limits are
five requests per IP per minute and at most 100 new reports per UTC day, with
a streamed 64 KiB request-body cap and strict field validation. These are abuse
bounds, not authenticated sender identity. Reports are retained privately until
the owner removes them; no automatic retention period is promised.

The receiver uses the existing Cloudflare email binding; no domain mail routing
or paid subscription was changed. Observability has sampled invocation logs and
traces, with redacted query strings; application code never logs report bodies.
The service dependency audit initially found eight inherited development-tool
findings; scoped Zod/Undici/sharp pins remove those findings. This does not
certify the separate default-branch GitHub dependency graph.

## Composer edge

The owner supplied a crop showing the right rounded edge/shadow near Send.
An isolated source run measured narrow Chat/Home clipping boundaries only
21–32 px beyond the surface against a 40 px ambient blur. The existing
`--composer-shadow-gutter` now reserves 40 px inside pane boundaries. The
720 px surface cap, radius, shadow, focus outline and pane scroll/pointer
containment remain; only narrow surfaces lose width to the required gutter.
The crop alone does not establish the owner's complete window/split geometry.

## Executed source checks

- 26 focused tests: draft/schema/transport, dialog, About and native-menu/bridge.
- Three receiver tests using real SQLite: atomic retry/digest identity,
  notification uncertainty, input/origin/size/rate refusals.
- Renderer and Electron typechecks; actual source build.
- Actual isolated Electron: native Help entry, draft edit, exact preview,
  Escape/reopen retention, 1440/800/500 px Chat and Home screenshots/geometry,
  narrow paint-gutter assertion, zero renderer errors. No report was sent by
  that source UI check. The gutter assertion failed before the CSS correction.
- Separate Worker build/deployment and public health response.

## Historical release hold

Release hold after owner clarification: the reported clipping and slow reset
are attachment-triggered (files and photos), not just narrow shadow paint.
The signed local checkpoint package is retained privately as a reproduction
baseline. Do not publish it as the attachment fix. Trace the actual attachment
action and recovery before promoting a replacement candidate.

The initial checkpoint did not establish package delivery. Subsequent release
preparation reproduced and repaired a missing native file-reference adapter;
see [the bounded repair](desktop-native-file-reference-2026-11-17.md).

## Normal Desktop release — 17 November

The replacement is [Vanta Desktop v0.1.0](releases/desktop-v0.1.0.md), not another
Iris build. Source `b12f8af0` is pushed. Its final ZIP is Developer ID signed,
Apple Accepted, stapled, Gatekeeper accepted and fingerprint-verified.

Actual extracted-ZIP UI proof passed in a private synthetic profile: native
Help and Settings → About open the same form, a local unsent draft survives
quit/relaunch, and no renderer errors were captured. Exactly one separately
approved synthetic report was stored by the private receiver. Database readback
confirmed the email service acknowledged its notification; inbox arrival is
not established. The extracted-ZIP replay sent nothing. Existing owner app/CLI,
history, credentials and approvals were not changed.

Desktop auto-update is a separate open card: the current update feed is null
and native update methods remain unimplemented. A CLI updater or a new ZIP
does not satisfy it. The original tester's attachment/reset incident is still
open despite the supported project-file/PNG package proof. All pre-existing
cards and work remain preserved.
