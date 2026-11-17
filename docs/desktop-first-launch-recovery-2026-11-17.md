# Desktop first-launch recovery — 2026-11-17

## Finding and narrow change

The signed 0.1.0 candidate already opens Vanta's provider picker on an isolated
first launch. It does not need Hermes's download/Python/install wizard: the
packaged app carries its Node runtime and kernel.

A real recovery gap was reproduced in that packaged app: choose a provider
later, start a chat, leave an unsent draft, quit and reopen, then press Send.
Session creation rejects the missing primary OpenAI key before `prompt.submit`
exists. The renderer shows a terminal-oriented “Session unavailable” toast and
does not reopen setup. Draft custody retains the rejected text, but the user
has no immediate provider recovery surface.

The patch recognizes Vanta's precise primary missing-key error and routes the
early session-creation failure through the existing provider picker. It reuses
the same recovery helper for later prompt failures, keeps foreground-chat
ownership checks, and does not retry or resubmit automatically. Unrelated
session errors remain ordinary notifications. Auxiliary key warnings do not
trigger primary-provider setup. No new wizard, permissions, credentials,
provider architecture or setup persistence mechanism was added.

## Executed evidence

- Before the patch, the signed 0.1.0 packaged control failed at the missing
  provider-picker recovery after skip → quit/relaunch → Send. The retained draft
  and terminal-oriented error were visually inspected.
- A separate actual packaged five-step run passed initial picker discovery,
  stopped-local-endpoint error, retained endpoint with explicit retry, one
  canned local response, and cold restart with the same chat and unsent draft.
  This verifies the existing setup path, not the corrected skip/send path.
- Focused renderer tests: **58 passed** across provider-error recognition,
  early-create recovery, submit utilities and gateway status. The regression
  was observed failing before the production patch. Tests also assert no setup
  focus steal into a different chat and no provider flow for an unrelated error.
- Renderer TypeScript check passed. The new packaged proof parses successfully.
- No full suite was run. ESLint could not run because its executable is absent
  from this dependency tree; no dependencies were installed to hide that gap.

## Exact candidate replay

Run from `desktop-next`, after the coordinating build owner creates the updated
packaged candidate:

```sh
VANTA_PACKAGED_APP=/absolute/path/Vanta.app node tools/done-path/first-launch.mjs
```

The proof owns an isolated HOME, VANTA_HOME, Electron profile, kernel port and
synthetic projects. It removes inherited credentials, uses minimal system PATH
inside the app, and serves canned local model discovery/chat on loopback.
It checks skip persistence, unsent draft persistence, required setup reopening,
stopped-model retry, no automatic model submission, exactly one explicit model
request and configured cold-restart continuity. Screenshots and evidence stay
in the private temporary evidence directory printed by the script.

## Not established yet

The corrected path has **not yet passed in a newly built signed package**.
Existing signed-binary evidence is a control, not acceptance of changed source.
This lane has not validated DMG installation, notarization, updater behavior,
real paid-provider authentication, microphone/native permissions, external
accounts, VoiceOver, or unfamiliar-person acceptance. Those remain separate
gates. No source/runtime builds, commits, pushes, card changes or owner-profile
changes were performed by this lane.
