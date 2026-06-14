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

## Auth (login-walled channels)

Channels like Reddit and Twitter need a logged-in session. The shared path (`reach/cookie.ts`):

1. `/cookie` shows which channels have a stored cookie + the export guide.
2. You export your browser session with the **Cookie-Editor** extension (Export → JSON) and paste it.
3. The agent calls **`cookie_import {channel, cookie}`** — kernel-gated (its `describeForSafety` signals credential handling so the kernel asks first). The cookie is normalized to a `k=v; k2=v2` header and stored **0600** at `~/.vanta/cookies/<channel>.cookie` — local only, **never logged or echoed**.

`parseCookieInput` accepts either a Cookie-Editor JSON export or a raw header; channel names are slug-validated (no path traversal). Channel tools read their cookie via `loadCookie(channel)`.

## Channels

| Channel | Status | Backends | Notes |
|---------|--------|----------|-------|
| `web` | ✅ | web_fetch (Readability) | zero-config, built-in |
| `search` | ✅ | auto ▸ ddg ▸ searxng ▸ serpapi ▸ brave ▸ bing ▸ jina | provider via `VANTA_SEARCH_PROVIDER` |
| `rss` | ✅ | `rss_read` (pure-TS RSS/Atom parser) | zero-config; `rss_read` tool — `reach/rss-parse.ts` |
| `reddit` | _next_ | opencli ▸ rdt-cli | `REACH-REDDIT` (needs cookie) |

Build queue + the deferred platforms (Twitter, LinkedIn, podcast, V2EX, Bilibili, Xiaohongshu, Xueqiu) are tracked as `REACH-*` cards in `roadmap.json`.
