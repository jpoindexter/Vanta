# UI-TARS-desktop — desktop-operator reference

**Card:** DESKTOP-UI-TARS-REF · **Status:** reference capture · **Track:** Harness

A reference for Vanta's desktop-operator surface. Captures the upstream pattern UI-TARS / UI-TARS-desktop establishes and maps it onto what Vanta already ships, so future desktop-operator slices steal the right ideas instead of re-deriving them.

> Scope note: this is a *pattern* reference, not a vendored implementation. Vanta does **not** depend on or bundle UI-TARS. The concrete loop Vanta runs is `vision-action/loop.ts` (shipped as DESKTOP-VISION-TO-ACTION). Where this doc is unsure of an upstream specific, it says so rather than inventing one.

## What UI-TARS-desktop is (the reference)

UI-TARS is a native GUI-agent line of work: a vision-language model drives a real desktop/browser by **looking at the screen and emitting grounded actions** (click at (x,y), type, scroll, key), rather than calling app APIs. UI-TARS-desktop is the desktop-operator harness around that model — screen capture in, actuation out, in a perceive→act loop.

The transferable idea, independent of the specific model:

1. **Perceive** — capture the current screen as an image (the model's only input; no a11y tree assumed).
2. **Ground** — turn an intent ("click the Submit button") into concrete coordinates on *this* frame.
3. **Act** — actuate the grounded action through an OS driver (mouse/keyboard).
4. **Verify** — re-perceive; did the screen change as expected? If not, it's a mis-click.
5. **Recover** — on no-change / wrong-change, re-observe and retry rather than blindly continuing.

## How Vanta already maps to it

Vanta shipped this loop as **DESKTOP-VISION-TO-ACTION** (`vanta-ts/src/vision-action/loop.ts`, pure + fully injectable):

| Reference stage | Vanta surface |
|---|---|
| Perceive | macOS `screencapture` substrate (injected) → frame |
| Ground | a vision provider grounds the target → coords (`parseGroundResponse`, fail-safe to *not-found*) |
| Act | `cliclick` actuation (injected) |
| Verify | re-perceive + a vision change-verdict (`parseChangedResponse`, **ambiguous → SAME** so an unclear frame retries, never false-succeeds) |
| Recover | `runVisionAction` re-observes up to `maxAttempts`; a no-change frame is flagged as a **mis-click** |

The `vision_action` tool (`tools/vision-action.ts`) exposes it kernel-gated. Each parser/arg-builder is pure + unit-tested; the loop is tested against an injected substrate. The browser analogue is `browser_act` (`browser/act.ts`) — the action-OUT surface over Playwright, with `classifyAction` flagging irreversible controls.

## What Vanta deliberately does differently (the safety delta)

UI-TARS-desktop optimizes for autonomous task completion. Vanta is a *trusted-operator* agent, so the same loop runs under extra constraints:

- **Kernel gate first.** Every actuation flows through `assess()` before it fires — a grounded coordinate is still a tool call the kernel can Ask/Block. Vision/grounding never bypasses the safety boundary.
- **Fail-safe verdicts.** Grounding fails to *not-found* and the change-verdict resolves *ambiguous → SAME*, so an unsure frame retries instead of declaring false success — the opposite of an optimizer that assumes progress.
- **Irreversible-action flagging.** Submit/buy/delete/login/send sequences are classified and approval-gated (mirrors `browser_act`'s `classifyAction`), rather than actuated optimistically.
- **Injected substrate.** Capture/ground/act/verify are all injected seams — Vanta can run the loop against a fake substrate in tests, and swap the real OS driver per platform without touching the loop logic.

## Live boundary (what a future slice needs)

The documented boundary for real desktop operation: macOS + Screen Recording permission + a vision model + the `cliclick` helper. OS-level actuation beyond `cliclick` (Linux/Windows drivers, multi-display targeting, a11y-tree fusion) is the desktop-driver boundary — the next desktop slices live there, not in the loop.

## Steal-list for future desktop-operator work

- Keep the **5-stage loop pure + injected**; only the substrate is platform-specific.
- Keep verdicts **fail-safe** (ambiguous retries, never false-succeeds) — this is what makes an unattended desktop loop safe to leave running.
- Treat **grounding as untrusted output**: validate coords are on-screen, clamp, and route the actuation through `assess()` like any other tool call.
- A **mis-click detector** (screen-didn't-change) is cheaper and more reliable than trusting the model's self-report of success.
