# Local dictation — Desktop and terminal

This development increment adds explicit local dictation to the ordinary Vanta
composer. It is not always-listening voice mode and does not submit a message.

## Controls

| Surface | Start | Finish | Discard | Setup/help |
| --- | --- | --- | --- | --- |
| Desktop | Mic button or Command/Ctrl+Shift+D with composer focused | Same button/shortcut; maximum 30 seconds | Escape or Cancel | Mic tooltip and keyboard-shortcuts dialog |
| TUI | Ctrl+R or `/voice record [seconds]` | Stops after requested duration, default 5 seconds | Escape, Ctrl+C, Ctrl+R again, or `/voice cancel` | `/voice`, `/voice setup`, `/setup voice`, `/help` |
| Shell | `vanta voice record [seconds]` | Stops after requested duration | Ctrl+C | `vanta voice`, `vanta voice setup` |

The TUI shortcut respects customized keybindings. Desktop shortcuts do not take
over other text fields or dialogs. Recording/transcribing status stays visible.
The TUI transcript is appended to your current draft; Desktop does the same.
Read and edit it, then deliberately press Send/Enter. The standalone shell
command prints text without starting an agent conversation.

Switching chats, cancelling or exiting invalidates pending dictation. Audio is
bounded and temporary. A late transcription must not enter another chat.

## Local setup

This slice requires an installed Python Whisper executable, ffmpeg, and a cached
Whisper checkpoint in `~/.cache/whisper/<model>.pt`. The default model is `tiny`.
No engine, model or account is downloaded or enabled automatically.

Use `/voice model base` to choose an already-installed model for the TUI session.
For a shell invocation, use `VANTA_STT_MODEL=base vanta voice status` or the same
prefix with `record`. The Desktop host reads `VANTA_STT_MODEL` when launched;
a persistent cross-surface model picker is still future work.

On macOS, allow the application that records in System Settings → Privacy &
Security → Microphone. Desktop uses Vanta; terminal capture may be attributed to
the terminal application. `vanta voice mic` opens the existing permission setup.
Engine/model readiness does not prove that the physical microphone is allowed.
The CLI needs sox or macOS ffmpeg recording support; other-platform ffmpeg capture
is not implemented by this slice.

Local dictation stays local. **The selected agent model can still be hosted**:
sending the resulting text uses your normal provider and approval settings.

## Separate spoken-conversation path

`vanta voice conversation` explicitly starts the existing conversational voice
loop, which submits transcripts to the configured agent. This is different from
dictation. The previous TTS setup remains available through `vanta setup tts`;
`/setup tts` invokes its existing shell handoff. `/setup voice` does not leave
the TUI. Hosted output providers may charge and send text off-device.

The curated model-download manager, unified Desktop voice settings, downloadable
local neural speech output and newly verified hosted providers are not delivered
by this dictation slice. See `VOICE-LOCAL-MODELS-AND-PROVIDERS` in canonical
`roadmap.json`; that card remains incomplete.

## Verification boundary

Focused source tests cover cancellation, approval-independent draft preparation,
session isolation, keyboard handling and error paths. Packaged proof uses a
synthetic WAV as Chromium's microphone input with a test-only
`AudioServiceSandbox` exception so the audio utility can read its temporary
fixture. Production sandboxing is unchanged. Electron recording, renderer,
authenticated HTTP and the already-cached Whisper model remain real; the
external agent provider is a local fixture and must receive zero requests.

This does **not** establish physical microphone quality, normal-profile macOS
consent, hosted speech operation, or full offline agent operation. Exact local
commands, exits, package identity and installation outcome follow.

## Executed checks — October 3

| Check | Command | Exit / observed result |
| --- | --- | --- |
| Runtime / renderer types | `tsc --noEmit`; `tsc --noEmit -p desktop-app/tsconfig.json` | 0 / 0 |
| Focused dictation tests | `vitest run` over the nine voice, HTTP, renderer, CLI, Ink and readline files | 46 passed, 0 failed |
| Electron microphone policy | `node --test desktop-app/electron/microphone-permissions.node-test.mjs` | 0; 6 passed |
| Signed local package | `npm run desktop:pack` | 0; Developer ID signature verified |
| Packaged interaction | `node scripts/desktop-dictation-proof.mjs` | 0; 6 checks, zero agent requests |
| Real terminal replay | `node scripts/tui-dictation-proof.mjs` | 0; 4 checks, two synthetic captures, zero agent requests |
| Effect inventory | `node scripts/generate-trust-01-effect-surface.mjs`; `node scripts/trust-01-effect-ledger.mjs` | 0; 414 surfaces, zero unmediated effects |
| Changed production size / architecture | pre-commit `lint --staged`; `src/arch/cli.ts` | 0; 34 files within limits, all 5 boundaries hold |
| Secrets / whitespace | staged Gitleaks and `gitleaks git --log-opts=1b7d2afc..HEAD`; `git diff --check` | 0; zero findings |
| Roadmap / protected paths | build-order, current and website generators; shipped-record equality and path inventory | 0; 1,363 cards, all statuses/shipped evidence retained, no protected/forbidden paths |

The tested `app.asar` SHA-256 is
`7e80b4f016281e0321f479527f650ef4ab52544c6b995a2db11c554c4bb09d69`.
Local reports/screenshots are under `vanta-ts/.artifacts/dictation-proof/` and
`vanta-ts/.artifacts/tui-dictation-proof/` (ignored, synthetic input only).
The terminal replay uses the real shipped `bin/vanta.mjs`, tmux/Ink, an isolated
kernel/profile, shared capture cleanup and cached Whisper; only the physical
recorder and external agent provider are replaced by fixtures.

An initial Desktop fixture failed to reach Chromium's sandboxed audio process;
the test-only exception above corrected that. This also exposed digital-silence
hallucinations: exact zero-sample PCM now stops before Whisper. This is not a
claim that arbitrary background noise cannot produce an inaccurate transcript.
An initial terminal setup assertion failed after help-overlay/paste ordering;
direct setup in the final replay passed without a runtime routing change.

The full repository suite was deliberately not rerun. Focused behavior, type,
size, architecture, secret and whitespace checks bound this increment; they do
not establish the remaining voice roadmap acceptance.

## Installation boundary

The signed candidate is ready. At the final native check, the UI tool reported
the Mac locked, so Vanta could not be quit normally for safe replacement.
The running `/Applications/Vanta.app` was not overwritten. No microphone
permission was granted and no physical recording was started.
Quit Vanta after unlocking to allow the verified installer to retain a rollback
copy and replace the app.

## Publication and CLI update

Implementation commit `1cb98ef0d3c1924ae73d49f8e38741848fbd3339` was pushed
normally to `codex/librechat-shell-adapter-20261002`, draft PR #60; remote/local
divergence was 0/0. It changes 64 logical files (+2,711/-593), including tracked
renderer assets. GitHub Actions remain disabled; no merge, release or tag.

The installed CLI checkout was fast-forwarded from `d4066399` to that code
commit, preserving its original branch and all three untracked user scripts with
unchanged SHA-256 values. The real `/Users/jasonpoindexter/.local/bin/vanta`
launcher executed `voice status` and `voice setup` in a TTY with exit 0: cached
`tiny` reports ready, the menu explains draft-only input, and setup explains
explicit engine/model installation. No recording or provider request was made
by these normal-profile commands. This proves installed discovery, not physical
capture. The isolated real-TUI recording proof above covers the exact code.

README, canonical roadmap and Trello voice card were updated. The card remains
incomplete. GitHub still reports 133 existing default-branch dependency alerts;
this feature increment does not remediate or certify dependency security.
