# Chat-shell-first startup — 2026-10-25

Owner request: remove inherited loading takeovers, not just change their colors.
Keep the conversation, draft, navigation and recovery reachable while connecting.
This is not permission to skip setup, approvals, install/update holds or errors.

## Connection surface

`GatewayConnectingOverlay` retains its compatibility name but no longer mounts
a full-window background, decode animation or focus-taking modal. A compact,
polite connection status appears below the titlebar, outside the composer. Its
Open logs action uses the existing bridge. The slow-first-run Continue without
setup action still invokes the existing callback. Connection success removes
the status immediately: the previous 360 + 300 + 520 ms exit sequence and looping
preview timers are gone. Boot timeout/retry policy is unchanged.

The ordinary welcome on an empty chat is not a loading screen and keeps the
owner's Appearance preference. Actual provider selection, explicit sign-in,
credential recovery, install errors and interrupted-update holds remain separate.
The native window already shows on `ready-to-show`, without a branded dwell timer.

Passive unresolved provider readiness now leaves the shell visible; a confirmed
need for setup, explicit manual/credential request or active error still opens
the real setup surface. Confirmed setup no longer imposes a 1,180 ms visual
dwell, scramble text or exit fade. A synchronous in-flight guard prevents
duplicate confirmation/acknowledgment, buttons reflect real pending work, and a
failed acknowledgment keeps its notice retryable. Inline progress for actual
sign-in/network work still uses the house Loader primitive.

## Executed source checks

- Connecting status, hard boot recovery and update-hold tests: 28 cases pass.
- Existing first-run skip/real credential-wall checks: 2 cases pass separately.
- Renderer TypeScript check passes with the installed compiler.

Parent passive-readiness checks: 15 cases/three files pass. Final confirmation,
provider and owner-store checks: 55 cases/six files pass, with two existing jsdom
`window.open` warnings. Size analysis of the three changed UI production files
has no new/worse finding against the existing baseline (15 inherited findings).
No suite-wide acceptance is implied.

These component checks alone do not establish first paint or installed behavior.
Subsequent [exact delivery](SHELL-FIRST-DELIVERY-2026-10-25.md) installs source
`536e17fb`, signed and Apple Accepted/stapled, with its own installed 13-step/
seven-probe path. Startup observation has 16 passing assertions but remains
PARTIAL because sustained interaction while connecting was not observed. The
earlier `4a2f4ab8` package did not contain this startup change.

## Continuity boundary

The independent packaged `4a2f4ab8` continuity journey passes ten assertions:
two distinct real chats, exact draft/image/model retention through switches,
reading-anchor return, and no automatic model submission on cold restart.
It then fails because image draft attachments are not restored after restart.
Text and model remain. Queue/unread/later restart assertions were not reached.
The initial multiline synthetic-history failure was separately traced to
rich-editor newline serialization; the revised history keeps the exact request
assertion and uses wrapping text, not normalized expected data.

Do not persist attachment bytes into the current globally keyed text-only draft
map. Durable IDs are only unique within a profile/connection. Follow-on work
must thread the existing ComposerScope owner through persistence, validate and
bound binary custody, retain live work on storage failure, and prove isolation
before claiming complete restart continuity. No such attachment fix is claimed.

## Design-reference boundary

The current installed reference is `/Applications/ChatGPT.app`, whose ASAR
identifies Codex 26.1021.31345, SHA-256
`130145706a912db74e4d260ad7538f10f1e05e88af955f9afba42cdf01e64606`.
REA package inventory is retained under parent evidence
`ev_3a8709e668105e29e824984d414c0fe5a2e032cef1555d8742a1f8a3962ce551`.
This refresh replaces the older reference identity, not its historical receipt.
Seven unpacked-native integrity metadata contradictions remain explicit; this
inspection is not a package-trust attestation. No native code was executed.

Live computer-control access to the running reference was safety-refused.
No alternate runtime inspection, injection or restart bypass was attempted.
Static CSS declarations and owner-provided screenshots may guide Vanta tokens,
but cannot certify current computed styles, hover/focus behavior, native shadows
or all reference flows. Proprietary source, fonts, logos and assets are not
transplanted into Vanta.

The [reference dossier](reference/codex-2026-10-25/DESIGN-REFERENCE.md) and
normalized token/contrast/inventory records retain all 375 stylesheet identities
and broad syntax coverage. The larger raw declaration supplement is privately
backed up, not committed or imported as application code. Core tokens remain
separate from feature/editor branches; small-text contrast failures are flagged.

Applied principles: shell-first progressive disclosure, cognitive-load reduction,
accessible polite status, motion only when it carries useful feedback, and
separation of executed behavior from static reference evidence.
