# Messaging gateways — iMessage · Telegram · WhatsApp · Signal + setup wizard

> Roadmap: `MSG-IMESSAGE` · `MSG-WHATSAPP` · `MSG-SIGNAL` · `MSG-WIZARD` · `MSG-PAIRING`
> · `MSG-REGISTRY`. Design document for Vanta messaging gateways.

## What Vanta already has

The abstraction is done. `gateway/platforms/base.ts` defines `PlatformAdapter`:
`{ id, connect(), disconnect(), send(OutboundMessage), poll(): InboundMessage[] }`.
**Telegram ships on it** (`gateway/platforms/telegram.ts`, pure-fetch Bot API long-poll).
`gateway/run.ts` polls `deps.platform` each tick. So every new platform is **one adapter
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

The targeted CLI command is `vanta setup messaging telegram`. It recognizes an existing configuration before replacing it, validates the BotFather token format, calls `getMe` before persisting, and then collects the numeric owner/chat allowlist. Failed validation preserves the existing `.env`. Interactive `/setup` opens a hub for Model, Telegram, Voice, and MCP; `/setup telegram` reports unconfigured, repair-needed, configured-but-stopped, polling-live, or webhook-live state and then hands control to the targeted wizard. The TUI is unmounted while readline owns the terminal and is freshly prepared after the wizard returns, so hidden input and keyboard modes do not conflict. `/setup telegram status` is read-only. Desktop uses the same deterministic status model, so the Telegram setup question works even when no model provider can initialize. Typing `/` in Desktop exposes **Set up Telegram** and opens Connect > Messaging > Telegram directly. Telegram's native command menu remains deferred until the gateway owns every command it advertises.

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
