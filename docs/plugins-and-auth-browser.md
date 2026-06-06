# Plugins + AUTH-BROWSER — clean, industry-standard capability install

> Roadmap: `PLUGIN-SYSTEM` (clean install model) + `AUTH-BROWSER` (first plugin).
> Sources: the "clean plugin setup" goal + Vanta's own design (`argo skill 4.rtf`), 2026-06-05.

## Current state: already clean (verified 2026-06-05)

The fear was that installing Playwright/Chromium polluted the repo. It did not.

| Thing | Where it lives | In repo? |
|-------|----------------|----------|
| Playwright Chromium binary | `~/Library/Caches/ms-playwright/chromium-1223` (OS cache) | No |
| `playwright-core` package | `argo-ts/node_modules/` (lazy-required) | No (gitignored) |
| Rust build | `target/` | No (gitignored) |
| Runtime state | `~/.argo/` (global) + repo `.argo/` (gitignored) | No |
| Audit clones | `reference/` (812M) | No (gitignored) |

`PLAYWRIGHT_BROWSERS_PATH` is **unset** → Playwright uses its standard OS cache, which is
correct. The danger to avoid is `PLAYWRIGHT_BROWSERS_PATH=0`, which forces browsers into
`node_modules` — don't set that.

## The plugin model (industry standard)

A **plugin** = an optional Vanta capability = `{ tools + optional skill + lazy deps }`.
The rule, so nothing pollutes the project:

1. **Source only in the repo.** Tools/skills are TS + Markdown, committed.
2. **Native deps → OS cache.** Browser binaries, models, etc. download to the platform
   cache (`~/Library/Caches/...`, XDG `~/.cache/...`), never the repo or `node_modules`.
3. **Runtime/secret state → `~/.argo/`.** Profiles, tokens, downloads — outside the repo,
   gitignored, `0700`.
4. **Lazy-load deps.** `playwright-core` is `await import()`ed only when a browser tool
   runs, and degrades gracefully if the browser isn't installed (already the pattern).
5. **Transparency.** `argo plugins` (list/install/remove/where) + `argo doctor` report
   exactly where each capability's deps and state live, so "is it polluting the folder?"
   is answerable in one command.

> Note: MCP is already the *runtime-extension* half of this — `mount_mcp` (shipped) mounts
> external MCP servers' tools live. `PLUGIN-SYSTEM` adds the *install-hygiene + visibility*
> half for native-dep capabilities like the browser.

`PLUGIN-SYSTEM` done: `argo plugins` lists capabilities + where each one's deps/state live;
`argo plugins install browser` fetches Chromium into the OS cache (never the repo); `argo
doctor` confirms no plugin files in the project tree.

## AUTH-BROWSER — the first plugin (a universal capability)

Authenticated browsing of logged-in sites (X, GitHub, Google, dashboards) **without
stealing cookies from your real browser.**

### Why a dedicated profile, not cookie import
Reading Chrome/Safari's cookie DB to inject sessions is malware-shaped: keychain/OS
encryption, high secret-handling risk, easy to leak auth cookies. Instead Vanta gets its
**own** persistent Playwright profile you log into manually once.

### Flow
```
argo browser auth x.com         # opens a HEADED Chromium in ~/.argo/browser-profiles/x.com/
                                # you log in manually — Vanta never sees password/2FA
                                # close the window → session stays in that profile
browser_extract_auth({url, profile:"x.com", what:"text"})   # headless launchPersistentContext, read-only
```

### Tools (built on existing browser-extract/navigate/screenshot + isAllowedDomain)
- `browser_auth({site})` — create/login a profile (headed, manual login, no cookie read).
- `browser_extract_auth({url, profile, what})` — read text/links/tables from a logged-in
  page (headless), domain-bound, then close.
- `browser_profiles` — list profiles (domains + timestamps + mode only — **no cookies**).
- `browser_forget <site>` — remove a profile (approval-gated; deletes auth state).
- `browser_navigate_auth` (click/fill) — **later**, approval-gated per action.

### Safety rules (non-negotiable)
1. Dedicated profile only — never import real-browser cookies.
2. Domain-bound — an `x.com` profile may visit only `x.com`/`twitter.com`; redirect
   elsewhere → stop unless approved.
3. Never return cookies, auth headers, localStorage, sessionStorage, or raw session
   blobs — only visible text/links/tables (screenshots if approved).
4. Read-only by default; posting/DM/like/follow/settings/purchase = explicit approval each
   time.
5. No password/2FA handling — if a login form appears, tell the user to run `argo browser
   auth <site>` and log in manually.
6. Visible indicator — say "Using authenticated profile: x.com" on every authed use.

### Files
- `argo-ts/src/browser/profile.ts` — `browserProfileRoot(env)`, `sanitizeProfileId`
  (reject `../`), `profilePath` (`mkdir 0700` under `~/.argo/browser-profiles`),
  `profileAllowsUrl(profile, url)`.
- `argo-ts/src/tools/browser-auth.ts`, `browser-extract-auth.ts` — registered in
  `tools/index.ts`.
- Tests (mostly pure, no live browser): id sanitization rejects `../../secrets`; path
  stays under `~/.argo/browser-profiles`; `x.com` allows `x.com/search`, refuses
  `evil.com`; authed extract output never contains cookies; missing profile → actionable
  error.

### First slice — AUTH-BROWSER-1 (read-only)
`profile.ts` helper + `browser_auth` + `browser_extract_auth` + registration + tests. No
navigate/click/fill yet. **Done:** `browser_auth x.com` → manual login → `browser_extract_auth`
reads X search results from the profile; cookies stay confined; tests prove it.

## "Universal" — three layers
The same capability ships at three reuse levels:
1. **Tools** (code) — the `browser_*_auth` tools inside Vanta.
2. **Skill** (portable doc) — an `authenticated-browsing` SKILL.md (Vanta skills-library +
   Claude Code) teaching the safe pattern, so any agent uses it consistently.
3. **Plugin** (install bundle) — tools + skill + lazy Playwright dep, installed via
   `argo plugins install browser`, deps in OS cache. This is the "universal add-on" form.
