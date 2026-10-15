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

## Buzz via ACP

Buzz is intentionally not another `PlatformAdapter`. Its `buzz-acp` harness owns
relay subscriptions, channel membership, Nostr identity, batching, and recovery;
Vanta runs behind it as an ACP stdio agent:

```text
Buzz relay → buzz-acp → vanta acp serve
                         └→ buzz CLI / client-provided MCP tools
```

Build `buzz-acp` and the `buzz` CLI from `block/buzz`, mint a separate Buzz
identity for Vanta, then run:

```bash
export BUZZ_PRIVATE_KEY="nsec1..."
export BUZZ_RELAY_URL="ws://localhost:3000"
vanta buzz test       # bounded authenticated channel read
vanta buzz serve      # foreground mention/reply loop
```

`vanta buzz configure` prints the complete setup without echoing a configured
private key. The launcher sets Buzz's comma-delimited custom-agent contract to
`vanta` plus `acp,serve`. Vanta consumes the harness-supplied `systemPrompt` and
session MCP definitions; tool calls still pass through the kernel. Buzz defaults
to owner-only inbound access, so registering the agent owner and channel
membership remains a Buzz-side requirement.

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

`vanta setup messaging` is the shell-owned setup hub. It lists registered
platforms with configured/prerequisite state, keeps secret entry hidden, writes
configuration idempotently, and prints the exact platform-specific pairing or
permission steps. The TUI `/setup messaging` and natural-language repair
intents are status-only so Ink remains mounted and pasted credentials cannot
fall through to the shell.

### Telegram setup contract

The targeted CLI command is `vanta setup messaging telegram`. It recognizes an existing configuration before replacing it, validates the BotFather token format, calls `getMe` before persisting, and then offers a numeric owner/chat allowlist. Empty allowlist means **pairing**, not open access: an unknown chat receives a short-lived code before Vanta accepts instructions. Failed validation preserves the existing `.env`. Telegram tokens are entered only through the hidden prompt; a token exposed in a terminal, chat, or log must be revoked in @BotFather.

Interactive `/setup` is a hub for Model, Messaging, MCP, and Voice; `/setup telegram` reports unconfigured, repair-needed, configured-but-stopped, polling-live, or webhook-live state and stays inside the TUI. `fix telegram` and `repair telegram` route to the same status view. The explicit shell command `vanta setup messaging telegram` owns hidden token entry; `/setup telegram status` is read-only. This separation keeps the TUI mounted and prevents a pasted token from falling through to the shell.

Desktop follows the same contract. `/setup` opens Connect overview without creating an agent turn, `/setup model` opens the model picker, `/setup mcp` opens MCP, and `/setup telegram` opens Connect > Messaging > Telegram. The Telegram form verifies `getMe` before writing `.vanta/.env`, makes pairing versus an explicit allowlist visible, tests the saved bot against Telegram rather than checking for a local string, and can launch the project gateway with a readiness result. Telegram's native command menu remains deferred until the gateway owns every command it advertises.

The flow uses a local-first setup hub, existing-configuration detection, verification before persistence, explicit numeric authorization, and post-save gateway lifecycle checks. Vanta also uses a dependency-free IPv4 transport with bounded Telegram-IP fallback and preserves the `api.telegram.org` Host/SNI when local dual-stack routing is broken. BotFather credentials remain local, so setup does not require a managed-bot onboarding service.

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

## Current boundary

The registry, wizard, pairing flow, and Telegram status/repair separation are
implemented. Telegram's Bot API path has focused setup, IPv4 fallback, gateway,
and TUI replay evidence. Other adapters still require their own credentials,
platform permissions, and real-service acceptance before live delivery is
claimed.
