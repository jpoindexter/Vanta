# Reach — Vanta's internet-reach layer

> Adapted from Agent-Reach (MIT) — see `docs/research/agent-reach-eval.md`. We port the *pattern* (channels with probed, ordered backends + a doctor) and the curated routing table, not the Python.

A **channel** is one platform (web, search, rss, reddit, …). It does **not** read content itself — it describes an ordered list of backends (primary + fallbacks) and a `check()` that *probes* which backend actually works right now, so the `/reach` doctor can report the active backend and the exact fix on a gap. The actual read/search is done by a kernel-gated tool (`web_fetch`, `web_search`, `rss_read`, …). Adding a platform = one channel file + (optionally) its tool.

## Layout (`vanta-ts/src/reach/`)

| File | Role |
|------|------|
| `channel.ts` | The `ReachChannel` contract + `ChannelStatus` + pure `orderedBackends` (honors a `<NAME>_BACKEND` env override) |
| `probe.ts` | `probeCommand(bin, args)` — *really executes* a command (a `which()` shim isn't proof); never throws |
| `registry.ts` | `REACH_CHANNELS` list + `resolveChannel(url)` (URL → channel) + `checkAll(env)` (best-effort probe of every channel) |
| `doctor.ts` | pure `formatDoctor(statuses)` — the `/reach` report |
| `channels/web.ts` | the web channel → `web_fetch` (Readability), zero-config |
| `channels/search.ts` | the search channel → `web_search` (provider via `VANTA_SEARCH_PROVIDER`) |

`/reach` runs `checkAll` → `formatDoctor`: each channel's `✓/~/✘` status, its active backend, and `fix: <command>` on a gap.

## The channel contract

```ts
type ReachChannel = {
  name: string;
  description: string;
  backends: string[];          // ordered: [0] preferred, rest fallbacks
  tier: 0 | 1 | 2;             // 0 zero-config · 1 free-key · 2 setup
  canHandle: (url: string) => boolean;
  check: (env) => Promise<ChannelStatus>;  // probe → {status, activeBackend, detail, fix?}
};
```

## Adding a channel

1. `reach/channels/<name>.ts` exporting a `ReachChannel` — `check()` should *really probe* its backend (via `probe.ts`) and set the active backend (or `off` + a `fix`).
2. Append it to `REACH_CHANNELS` in `registry.ts`.
3. If it reads/searches content, add a kernel-gated tool (`tools/<name>-read.ts`) that the agent calls; the channel is the routing/health half.

## Auth (login-walled channels) — universal by design

Channels like Reddit and Twitter need a logged-in session. The shared path (`reach/cookie.ts`):

1. `/cookie` shows which channels have a stored cookie + the export guide.
2. Export your browser session with a **Cookie-Editor** or **"Get cookies.txt LOCALLY"** extension — works in **any** browser (Brave/Chrome/Edge/Firefox) on **any** OS. The extension does the decryption locally.
3. Save the export to a file and run **`cookie_import {channel, file:"~/Downloads/<export>"}`** (preferred — no secret in chat), or paste it inline as `cookie`. Kernel-gated: `describeForSafety` signals credential handling so the kernel asks first; stored **0600** at `~/.vanta/cookies/<channel>.cookie`, **never logged or echoed**.

**Formats:** `parseCookieInput` accepts a **Cookie-Editor JSON** export, a **Netscape `cookies.txt`** (the de-facto standard used by yt-dlp / "Get cookies.txt"), or a raw `k=v; k2=v2` header — so whatever any user's browser/extension produces just works. Channel names are slug-validated (no path traversal); channel tools read their cookie via `loadCookie(channel)`.

**Why not auto-read the browser's cookie store?** Because it can't be universal: every browser × OS encrypts cookies differently (macOS Keychain + AES-CBC, Windows DPAPI + app-bound AES-GCM, Linux gnome-keyring/kwallet, Safari binarycookies), and it breaks on browser updates — yt-dlp's `--cookies-from-browser` is a perpetual maintenance fire for exactly this reason. The export-and-hand-over flow pushes the per-platform decryption into the browser extension (which always tracks its own format), keeping Vanta portable and low-maintenance.

## Channels

| Channel | Status | Backends | Notes |
|---------|--------|----------|-------|
| `web` | ✅ | web_fetch (Readability) | zero-config, built-in |
| `search` | ✅ | auto ▸ ddg ▸ searxng ▸ serpapi ▸ brave ▸ bing ▸ jina | provider via `VANTA_SEARCH_PROVIDER` |
| `rss` | ✅ | `rss_read` (pure-TS RSS/Atom parser) | zero-config; `rss_read` tool — `reach/rss-parse.ts` |
| `reddit` | ✅ | reddit.json + cookie ▸ rdt-cli | `reddit_read` (search/read) — needs a cookie via `cookie_import`; anonymous is blocked |

The `reddit` channel reads Reddit's own `.json` endpoints authenticated with the stored cookie (no external CLI to install — anonymous access is blocked, so a cookie is required; `reddit_read` returns the exact setup step when none is configured). `rdt-cli` is the documented fallback backend (not wired). Live coverage of `.json` from a datacenter IP can still be rate-limited — the wiring is correct and works on a residential IP with a valid cookie, same caveat as `web_search`.

Build queue + the deferred platforms (Twitter, LinkedIn, podcast, V2EX, Bilibili, Xiaohongshu, Xueqiu) are tracked as `REACH-*` cards in `roadmap.json`.
