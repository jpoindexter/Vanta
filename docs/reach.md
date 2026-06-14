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

## Wired into Opportunity-Radar

The reach channels feed the radar's pain-signal hunt. `radar scan_web` routes by source:

- `from:web` (default) — `query` → the search provider.
- `from:reddit` — `query` (+ optional `subreddit`) → Reddit search (needs a cookie); each post becomes a scored candidate.
- `from:rss` — `feed` (a feed url, or a site URL — feeds are auto-discovered) → each item becomes a candidate.
- `from:twitter` — `query` → X/Twitter search via twitter-cli.

All sources normalize to a common `{title, url, snippet}` (`radar/extract.ts` `fromReddit`/`fromFeed`/`fromTwitter`) and run through the same pain/buyer scorer; the source prefixes the opportunity id + note (`reddit-…`, `rss-…`, `twitter-…`). The fetchers (`reach/reddit.ts`, `reach/rss.ts`, `reach/twitter.ts`) are shared by the `*_read` tools and the radar.

## Self-heal — backends that rebuild when the platform changes

Brittle backends (twitter-cli especially — X rotates its GraphQL query IDs every few weeks) *will* break. A channel can declare `heal()`; the kernel-gated **`reach` tool** runs it:

- `reach doctor` — the doctor report (also `/reach`).
- `reach heal <channel>` — rebuilds the channel's backend, then re-checks. For `twitter`, heal **captures X's current query IDs from a real browser** (`reach/twitter-capture.ts healTwitter`): it drives a headless browser to x.com pages with your cookie injected and reads the live `Bookmarks`/`SearchTimeline` IDs out of the GraphQL requests the page makes — solving the rotation completely, including the lazy-loaded Bookmarks ID. Falls back to the static bundle scrape (`reach/twitter-heal.ts`) when playwright isn't available. Kernel-gated.

This is the reach analogue of the self-repair organ: *detect off → heal → re-check*. The browser drive is the general `reach/browser-session.ts` primitive (see below); `reach/heal.ts tryUpgrade` is a generic CLI-upgrade ladder for any future shell-backed channel.

### Authenticated browser — a general capability (any site)

`reach/browser-session.ts openWithSession(url, cookie)` opens **any** url in a real headless browser with session cookies injected, returning the rendered text + every request the page made. The **`browser_read`** tool wraps it: `browser_read {url, browser:"brave"}` reads any login-walled / JS-rendered page (x.com, reddit, linkedin, internal apps) by auto-injecting your logged-in cookies for that domain. Not X-specific — the X query-id capture is just one consumer.

### X/Twitter setup

Native GraphQL (no Python). Setup: (1) `cookie_import {channel:"twitter", browser:"brave"}` (auto-reads your live session — no export), or paste/file a Cookie-Editor export with `auth_token` + `ct0`; (2) `reach heal twitter` captures the live query IDs via the browser. Then `twitter_read bookmarks` / `search`. Bearer/features/query IDs stay env-overridable (`VANTA_TWITTER_BEARER`, `VANTA_TWITTER_FEATURES`, `VANTA_TWITTER_QID_<OP>`) as escape hatches. Live-verified: the browser capture pulls the same `Bookmarks` ID DevTools shows, and `twitter_read bookmarks` returns real bookmarks.

## Lessons applied from Agent-Reach issues

- **#368** (twitter cookie auth breaks on Windows — browser app-bound encryption): sidestepped by design — we pass `TWITTER_AUTH_TOKEN`/`TWITTER_CT0` from the stored cookie instead of relying on browser extraction, so it works headless + on Windows.
- **#322** (auto-discover feed sources): implemented — `fetchFeed` follows a site page's `<link rel=alternate>` feed (`reach/rss.ts discoverFeed`).

## Adding a channel

1. `reach/channels/<name>.ts` exporting a `ReachChannel` — `check()` should *really probe* its backend (via `probe.ts`) and set the active backend (or `off` + a `fix`).
2. Append it to `REACH_CHANNELS` in `registry.ts`.
3. If it reads/searches content, add a kernel-gated tool (`tools/<name>-read.ts`) that the agent calls; the channel is the routing/health half.

## Auth (login-walled channels) — universal by design

Channels like Reddit and Twitter need a logged-in session. The shared path (`reach/cookie.ts`):

**Automatic (no paste) — read the live browser session.** `cookie_import {channel, browser:"brave"}` reads the logged-in cookies straight from the browser's encrypted store (`reach/browser-cookies.ts`: macOS Keychain key → AES-128-CBC decrypt, zero deps). One Keychain approval the first time. macOS + Chromium-family (brave/chrome/edge); falls back to the manual paths below on any browser/OS. Channel→host map in `cookie-import.ts` (`twitter`→`%x.com`, `reddit`→`%reddit.com`).

**Manual (any browser/OS):**
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
| `twitter` | ✅ | x-graphql (native, cookie) | `twitter_read` (search + bookmarks) — **native TS GraphQL, no Python**. Needs an x.com cookie (`cookie_import twitter`) + query ids (`reach heal twitter`). Self-heals (see below) |

The `reddit` channel reads Reddit's own `.json` endpoints authenticated with the stored cookie (no external CLI to install — anonymous access is blocked, so a cookie is required; `reddit_read` returns the exact setup step when none is configured). `rdt-cli` is the documented fallback backend (not wired). Live coverage of `.json` from a datacenter IP can still be rate-limited — the wiring is correct and works on a residential IP with a valid cookie, same caveat as `web_search`.

Build queue + the deferred platforms (Twitter, LinkedIn, podcast, V2EX, Bilibili, Xiaohongshu, Xueqiu) are tracked as `REACH-*` cards in `roadmap.json`.
