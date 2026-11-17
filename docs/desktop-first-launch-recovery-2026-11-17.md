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
- The isolated installed **0.1.1**, source
  `819a67da9a6d0ba1e142ee0690bdf06b1d49ba30`, clean package-provenance candidate
  passed all seven packaged first-launch checkpoints. Its deep strict signature
  verification passed. Source digest:
  `a3f01745e8aa31d4020d9e2a14ba762e13e0d99f446a07f306064ed3aa2a0b6e`.
  Observed requests were `/api/tags` twice (stopped then explicit retry) and
  exactly one `/v1/chat/completions`. No renderer errors occurred. Screenshots
  of the first reply and cold-restarted retained chat/draft were inspected.
  No processes referencing the run's private profile remained after close.
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

### Explicit custody recovery is part of the workflow

After the first missing-key rejection, the saved message is intentionally
retained behind **Restore without sending**. The successful replay opens that
recovery action with an empty composer, asserts the exact original text is
restored and no model request occurred, then explicitly presses Enter once.
Setup must not bypass the custody fence or resubmit the rejected message.

Two earlier 0.1.1 replays incorrectly typed a different draft while the prior
rejected message was still unresolved. Enter and a Send click both produced no
model request, consistent with the custody client's interrupted-phase fence.
Their failure screenshots and private profiles were preserved, not replaced by
the successful evidence. The proof was corrected to follow the actual recovery
action; no production guard was weakened. The enabled Send appearance while
that custody fence is unresolved is a separate usability limitation, not proof
that the new provider setup failed.

Successful private evidence run: `vanta-first-launch-ZDis0k`, isolated profile
`vanta-donepath-ixUeWo`. Retained failed runs: `vanta-first-launch-Yhqeq8` and
`vanta-first-launch-XLDZv5`. These are private temporary evidence, not release
assets or owner data.

## 0.1.3 behavioral replay

The signed 0.1.3 candidate at source
`b2847a8f6665a5294d25478dd3cb20ac140a5da6` passed the same seven behavioral
checkpoints over three private launches. Its package declared clean source,
source digest `7f1cbee0cae5902e67eee755ecea3ad4a46cd639b610828fae29fea51e5181cb`,
and ASAR digest
`41d95a82d7a2c121b0ee99daf11fccb58eec6b188d38274718d297031d40cdde`.
The ASAR digest was unchanged after the run.

1. Missing credentials open the existing provider picker.
2. Choosing a provider later survives quit/relaunch.
3. The exact unsent draft survives that restart.
4. An explicit Send reopens the required provider setup.
5. A stopped local endpoint preserves its entered address and recovers after
   explicit retry.
6. **Restore without sending** restores the original request with zero model
   requests; a subsequent explicit Enter produces exactly one response.
7. A configured cold restart retains the conversation and another unsent draft
   without reopening setup.

Observed network paths were `/api/tags`, `/api/tags`, then exactly one
`/v1/chat/completions`; renderer errors were empty. Every test window was hidden
and nonfocusable on each launch, including any newly created windows. The app
closed normally, and no process referencing its private profile remained.
Private receipt: `vanta-first-launch-SIQY0G/result.json`; private profile:
`vanta-donepath-AuamBt`.

**No 0.1.3 screenshots were captured.** Only the two success screenshot calls
were disabled in memory because hidden-window capture had stalled in a separate
lane. All model, draft, restoration, restart and error assertions remained.
This is behavioral evidence, not fresh visual, camera, microphone, accessibility
or owner-profile acceptance. The replay did not access camera/microphone or
exercise their permission flows. A prior input-contaminated 0.1.2 attempt was
retained separately and excluded; the successful runs are not merged with it.

Apple notarization, native updating and the final installer are independently
recorded in the [0.1.3 release evidence](releases/desktop-v0.1.3.md). Their pending
or completed status must come from those executed delivery checks, not this
first-launch receipt.

## Not established yet

The corrected path passed in the exact new signed isolated installed copy.
This lane has not independently validated DMG installation, Apple notarization,
native updater relaunch or the normal owner-profile installation. Its isolated
launch deliberately refuses native updating because LaunchServices cannot
preserve the test's profile/environment overrides. It has not validated
real paid-provider authentication, microphone/native permissions, external
accounts, VoiceOver, or unfamiliar-person acceptance. Those remain separate
gates. No source/runtime builds, commits, pushes, card changes or owner-profile
changes were performed by this lane.
