# Agent-Reach — evaluation for Vanta

> Repo: github.com/Panniantong/Agent-Reach · **MIT** · Python 3.10+ · v1.5.0 · "vibe-coded"
> Goal: "check this repo, see if we can use it in Vanta — we'll prolly have to rewrite it to match our code."
> Verdict: **Yes — port the *pattern* + the *curated routing table*, not the Python. Strongest fit: it fills the Opportunity-Radar "scan free sources" gap.**

## What it is

A **capability/routing layer** that gives any shell-capable agent "internet reach" to 13 platforms: web, YouTube, RSS, GitHub, Twitter/X, Reddit, Bilibili, Xiaohongshu, LinkedIn, V2EX, Xueqiu, Xiaoyuzhou podcasts, + Exa web search.

Critically — **it does not read content itself.** It's an installer + doctor + router. Each platform is a `channel` with an **ordered backend list** (primary + fallbacks); `check()` *probes* which backend actually works (really executes a command — `which()` alone isn't proof), sets `active_backend`, and emits a fix prescription if broken. `agent-reach doctor` reports per-channel status. The actual reads are the agent calling the upstream CLIs directly (yt-dlp, gh, Jina Reader, twitter-cli, rdt-cli, feedparser, Exa-via-MCP…).

Channel contract (`channels/base.py`): `can_handle(url)` · `check(config) → (status, msg)` · `ordered_backends(config)` (applies a `<channel>_backend` override) · `backends` (the ordered list) · `tier` (0 zero-config / 1 free-key / 2 setup).

## Fit with Vanta

Vanta already covers a chunk of this, kernel-gated:

| Reach | Agent-Reach | Vanta today |
|-------|-------------|-------------|
| Read any web page | Jina Reader | `web_fetch` (Readability) ✓ |
| Web search | Exa via MCP | `web_search` (ddg/searxng/serpapi/brave/bing/jina) ✓ |
| YouTube | yt-dlp | `watch_video` ✓ |
| GitHub | gh CLI | `git_*` tools (+ could shell `gh`) ✓ |
| Browser ops | (defers to BrowserAct) | `browser_act` / `browser_navigate` ✓ |
| MCP backends | mcporter | `.mcp.json` mount + `mount_mcp` ✓ |
| Capability health | `doctor` | `/health` (partial) ◑ |
| **Twitter/X, Reddit, LinkedIn** | twitter-cli, rdt-cli/OpenCLI, linkedin-mcp | **— (gap)** |
| **RSS/Atom** | feedparser | **— (gap)** |
| **Podcast → text** | Whisper | `transcribe` exists (audio) ◑ |
| Bilibili / Xiaohongshu / V2EX / Xueqiu | bili-cli / OpenCLI / … | — (low priority for Jason) |

**The two things worth taking:**

1. **The pattern** — "a channel = an ordered list of real-probed backends + a fix prescription + a doctor report." Vanta has the seed of this (`resolveSearchProvider` auto-chain + `/health`); Agent-Reach is the systematic version. Generalize it into a `reach/` layer + upgrade `/health` into a true per-channel doctor (active backend + the exact fix command per gap).
2. **The curated routing table** — which upstream CLI is *currently* best per platform, and the fallback order. This is hard-won knowledge (they re-route when platforms break — e.g. yt-dlp→bili-cli when Bilibili added 412 anti-scrape). Pure knowledge, language-independent, worth more than the code.

**Why it's a strong fit, not just interesting:** the new channels (Reddit, Twitter, LinkedIn, RSS) directly feed two open items —
- **Opportunity-Radar's `scan_web`** (just shipped) is documented as needing a reliable free-source backend. Reddit/Twitter/HN-RSS channels are exactly that — pain-signal sources for the radar.
- The **`gripe`** project (Reddit complaint DB) needs Reddit reach.

## What to take vs skip

**Port (as kernel-gated, TS):**
- `reach/` channel contract mirroring Vanta's provider pattern (`canHandle`/`read`/`search`/`check` + ordered backends + env override) — pure + testable.
- Upgrade `/health` → per-channel doctor: active backend + exact fix command.
- Priority channels (by Jason's need): **RSS** (zero-config, pure-TS, feeds radar) → **Reddit** (feeds radar + gripe) → **Twitter/X** (cookie + a CLI) → **LinkedIn** (Jina Reader on public pages). Each shells out to the upstream CLI (kernel-gated) or uses native fetch.

**Skip:** the Python package, the installer (`pip install` / `agent-reach install` — Vanta has its own setup), the China-centric channels (Bilibili/Xiaohongshu/V2EX/Xueqiu) unless a concrete need appears, and the MCP-server integration (Vanta already mounts MCP).

## Port effort

Low-to-medium. The Python is thin glue (channels 1–11 KB each); the work is re-expressing the channel pattern in TS + wiring each upstream CLI as a kernel-gated tool. RSS is ~an afternoon (pure-TS parse, no external CLI). Reddit/Twitter need the upstream CLIs present (shell-out + cookie config) — degrade gracefully when absent, exactly like the existing `browser_*` / `playwright` tools.

## License / attribution

MIT — free to adapt. We're porting the *pattern + table*, not copying code verbatim, so attribution lives here (this doc) + the roadmap cards, per Vanta's no-provenance-in-code-comments convention. If any file becomes a near-verbatim translation, add the MIT copyright header to that file.

## Recommendation

Adopt incrementally as a **`reach` capability layer**. Start with **RSS** (cheapest, pure-TS, immediately feeds the radar), then **Reddit** (highest leverage: radar + gripe). Defer the rest behind real need. Roadmap cards filed under `REACH-*`.
