# Hermes setup wizard extraction — 2026-07-17

## Scope

Compared the current `NousResearch/hermes-agent` `main` branch at `d9ee342414` with Vanta's CLI and desktop setup paths. The source of truth was the local reference checkout under `reference/hermes-agent`, especially:

- `hermes_cli/gateway.py::gateway_setup`
- `hermes_cli/setup.py::_setup_telegram`
- `plugins/platforms/telegram/adapter.py::interactive_setup`
- `gateway/authz_mixin.py` and `gateway/pairing.py`
- `apps/desktop/src/app/messaging/index.tsx`

## What is worth taking

1. **Setup is a hub, not a model dialog.** A bare setup action must expose the available destinations, while a targeted action opens the requested destination directly.
2. **Existing configuration is first-class.** Reconfiguration preserves the current secret unless the operator deliberately replaces it.
3. **Verify before persistence.** Telegram token syntax is only a fast local check; `getMe` is the actual credential test and must pass before disk state changes.
4. **Authorization is part of setup.** The operator must see whether new chats pair or are restricted to an allowlist. Security cannot be hidden in an environment-variable footnote.
5. **Setup ends at a running outcome.** Saving credentials is not the end of the workflow. The next action is test, start/restart the gateway, and report live readiness or an exact log path.
6. **Registry-driven setup scales.** Platform metadata should continue to feed CLI, desktop, doctor, and gateway resolution rather than adding platform conditionals to every surface.

## Vanta-specific decisions

- Keep Vanta's existing platform-agnostic short-code pairing. An empty Telegram allowlist uses pairing; it does not grant open access.
- Keep manual BotFather provisioning. Hermes' automatic QR flow depends on a Nous-hosted onboarding service, which conflicts with Vanta's local-first trust boundary.
- Keep credentials in the project `.vanta/.env` with mode `0600`; never return saved tokens to the renderer.
- Treat `getMe` as credential proof and gateway readiness as runtime proof. These are separate checks and the UI names both.

## Implemented outcome

Roadmap card: `DESKTOP-SETUP-HUB-TELEGRAM-LIFECYCLE`.

- `/setup`, `/setup model`, `/setup messaging`, `/setup telegram`, and `/setup mcp` route deterministically in Desktop.
- Telegram Desktop save validates format and calls `getMe` before writing.
- Failed verification leaves `.vanta/.env` unchanged.
- Telegram access offers pairing or numeric chat allowlisting.
- Saved Telegram credentials can be tested live and the project gateway can be started from Connect.
- Focused unit tests cover route selection, preservation on failed verification, live-test semantics, and gateway-start state.

## Still requires real-path proof

Unit tests and renderer builds do not establish the packaged macOS flow. The card can ship only after the packaged app is exercised through `/setup` navigation, a real BotFather token is tested without exposing it, the gateway starts, and an inbound Telegram message receives a Vanta reply.
