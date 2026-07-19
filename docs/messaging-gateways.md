# Messaging gateways — iMessage · Telegram · WhatsApp · Signal + setup wizard

> Roadmap: `MSG-IMESSAGE` · `MSG-WHATSAPP` · `MSG-SIGNAL` · `MSG-WIZARD` · `MSG-PAIRING`
> · `MSG-REGISTRY`. Design document for Vanta messaging gateways.

## What Vanta already has

The abstraction is done. `gateway/platforms/base.ts` defines `PlatformAdapter`:
`{ id, connect(), disconnect(), send(OutboundMessage), poll(): InboundMessage[] }`.
**Telegram ships on it** (`gateway/platforms/telegram.ts`, pure-fetch Bot API long-poll).
`gateway/run.ts` polls `deps.platform` on the fast channel cadence (1 second by
default, configurable with `VANTA_CHANNEL_POLL_MS`) while cron, sentinels, loops,
and watchdog maintenance stay on `VANTA_GATEWAY_TICK_MS`. So every new platform is **one adapter
file + registration** — no core changes.

## Per-platform approach for a local macOS operator

| Platform | Approach | Send | Receive | Setup / risk |
|----------|----------|------|---------|--------------|
| **Telegram** ✅ | Official Bot API (shipped) | `sendMessage` | `getUpdates` long-poll | `VANTA_TELEGRAM_TOKEN` from @BotFather |
| **iMessage** | **Native macOS** | AppleScript `osascript` (`tell application "Messages" to send`) | poll `~/Library/Messages/chat.db` SQLite (read-only, since-last-rowid) | **Full Disk Access** (chat.db) + **Automation** (osascript) perms. Optional **BlueBubbles** REST+webhook mode for cross-machine. |
| **WhatsApp** | **Node subprocess bridge** — spawn Baileys/whatsapp-web.js, talk over `localhost:PORT` (GET `/messages`, POST send) | bridge POST | bridge poll | **QR pair** (creds in `~/.vanta/whatsapp/`). **Unofficial → ban risk + protocol breakage**; health-check + restart the bridge. **Business API** (Meta-verified) = ToS-safe alt. Bridge dep installs to `~/.vanta`, never the repo (see `PLUGIN-SYSTEM`). |
| **Signal** | `signal-cli` daemon, JSON-RPC over localhost | JSON-RPC `send` | SSE `/api/v1/events` | User runs + links `signal-cli` (Vanta doesn't do device registration). |

Each is a `PlatformAdapter` mirroring `telegram.ts`; keep the parse/shape logic in a pure
exported fn (`parseChatDbRows`, `parseWhatsappMessages`, …) and unit-test it offline — no
live device/DB/daemon in tests (same discipline as `parseUpdates`).

## Setup wizard (`MSG-WIZARD`)

`setup.ts` today picks an LLM provider only (`PROVIDER_CATALOG` + `runSetup` + `upsertEnv`).
Extend with a messaging step / `vanta setup messaging`:
1. List platforms with **availability** from the registry (configured? prereqs present?).
2. For the chosen ones, write env (`upsertEnv`, idempotent).
3. Print **exact setup/pairing steps**: BotFather link (Telegram); the Full-Disk-Access +
   Automation grant walkthrough (iMessage); QR scan + Node check (WhatsApp); `signal-cli`
   link (Signal).
Mirror `renderProviderMenu`/`runSetup`. No crashes on missing prereqs — explain them.

### Telegram setup contract

The targeted CLI command is `vanta setup messaging telegram`. It recognizes an existing configuration before replacing it, validates the BotFather token format, calls `getMe` before persisting, and then offers an owner/chat allowlist. Empty allowlist means **pairing**, not open access: an unknown chat receives a short-lived code before Vanta accepts instructions. Failed validation preserves the existing `.env`.

Interactive `/setup` is a hub for Model, Messaging, MCP, and Voice; `/setup telegram` reports unconfigured, repair-needed, configured-but-stopped, polling-live, or webhook-live state and then hands control to the targeted wizard. The TUI is unmounted while readline owns the terminal and is freshly prepared after the wizard returns, so hidden input and keyboard modes do not conflict. `/setup telegram status` is read-only.

Desktop follows the same contract. `/setup` opens Connect overview without creating an agent turn, `/setup model` opens the model picker, `/setup mcp` opens MCP, and `/setup telegram` opens Connect > Messaging > Telegram. The Telegram form verifies `getMe` before writing `.vanta/.env`, makes pairing versus an explicit allowlist visible, tests the saved bot against Telegram rather than checking for a local string, and can launch the project gateway with a readiness result. Telegram's native command menu remains deferred until the gateway owns every command it advertises.

The flow is adapted from the useful parts of Hermes' current gateway wizard: setup hub, existing-configuration detection, verification before persistence, explicit authorization posture, and post-save gateway lifecycle. Vanta does not copy Hermes' Nous-hosted managed-bot QR provisioning; keeping BotFather credentials local avoids adding a required third-party onboarding service.

## Reference patterns

- **Code-based pairing (`MSG-PAIRING`).** Replace the static
  `VANTA_TELEGRAM_ALLOW` allowlist with a real consent flow: unknown sender → one-time short
  code (unambiguous alphabet, ~1h expiry, rate-limited, lockout after N fails, `0600` in
  `~/.vanta/pairing/`); owner approves via CLI/TUI. Platform-agnostic — covers every adapter.
- **Platform registry (`MSG-REGISTRY`).** Each adapter
  self-registers `{id, factory, required_env, check_fn, install_hint}`. The gateway, the
  wizard, and `vanta doctor` read it → graceful "needs X" instead of a central if/elif and
  hard failures. New adapter = drop in an entry.
- **Adapter owns its transport.** poll / webhook / SSE / subprocess-bridge all hide behind
  `connect()` — no central poller assumption (Vanta's tick-poll already fits pull adapters;
  push adapters start their own listener in `connect()`).

## Honest risk read

- **iMessage** needs OS permissions (Full Disk Access for `chat.db`, Automation for
  `osascript`) and only works on a logged-in Mac. Native is clean but perms must be granted
  by Jason — the wizard walks it; can't be done headless.
- **WhatsApp** is genuinely fragile: unofficial libs risk account bans and break on protocol
  changes; needs Node + a periodic QR re-scan. Capture + build behind a clear warning;
  prefer Business API if a real account matters.
- **Telegram + Signal** are the low-risk official/CLI paths.

## Build order

1. `MSG-REGISTRY` (tiny, unblocks clean multi-platform wiring + the wizard).
2. `MSG-WIZARD` (config only — no OS perms, ships clean, gives the UX).
3. `MSG-PAIRING` (security; reused by all adapters).
4. `MSG-IMESSAGE` (native send+receive; needs Jason's perms for live test).
5. `MSG-SIGNAL`, then `MSG-WHATSAPP` (most fragile, last).
