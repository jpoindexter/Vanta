# Security Protocol — Vanta

Vanta is a **local trusted-operator agent**: it runs on your machine, with your
credentials, and can read/write files, run shell, reach the network, and drive a
browser. That power is the point — so the security model is about *bounding* it, not
removing it. This document is the source of truth for that model, the guarantees it
makes, the ones it does **not**, and how to run it safely.

> Rule Zero is the contract: no deletes, overwrites, out-of-scope writes, or
> secret handling without explicit authority. The checked local and signed
> macOS effect inventory enters one shared gateway and kernel and fails closed
> when required policy or journal state is unavailable. A future executor or
> another host must earn its own evidence before it inherits that claim.

## 1. Architecture: the kernel is the boundary

| Layer | Language | Role |
|-------|----------|------|
| `vanta-kernel` (`src/`) | Rust, zero deps | Intended root of trust — risk classifier, scope/protected-path checks, approvals, audit log, loopback HTTP API |
| `vanta` (`vanta-ts/`) | TypeScript, Node 22 | Agent loop and shared effect gateway — binds operation, target, payload hash, authority, execution, and receipts before consequential work |

Every consequential call in the checked inventory follows: stable effect
description → shared gateway → kernel `assess()` → `{Allow | Ask | Block}` →
content-free settlement receipt.
The TS layer may **tighten** a verdict (rules, auto-mode, operator profile) but can **never
loosen a kernel `Block`**. If the kernel is unreachable the gate **fails closed** (the tool is
blocked, gracefully, not executed).

## 2. What the boundary enforces

- **Risk classification** (`src/safety.rs`) — catastrophic forced-recursive deletion,
  device writes, data-loss, and exfiltration → `Block`; bounded deletion, exec-vectors,
  machine/credential config, out-of-scope paths, and irreversible ops → `Ask`;
  read-only/reversible in-scope work → `Allow`.
- **Scope containment** (`src/scope.rs`) — canonicalized path containment; `..` traversal,
  sibling-prefix (`/a/vanta-evil` vs `/a/vanta`), and symlink escapes are rejected.
- **Protected paths** — model-controlled paths block the kernel source
  (`src/*.rs`, `Cargo.toml`/`.lock`), `vanta-ts/src/factory/*`, and
  `MANIFESTO.md`. The checked inventory records explicit trusted-infrastructure
  adapters and rejects unknown executors.
- **Approvals** (`src/approvals.rs`) — only `Ask` actions queue; `Block` refuses, `Allow`
  runs. Persisted to `.vanta/approvals.tsv`.
- **Tamper-evident audit log** (`src/audit.rs`) — every event is hash-chained
  (`h = sha256(secret_key + prev_h + payload)`); a per-install key (`.vanta/audit.key`, 0600)
  makes edits/inserts/reorders detectable. When the log, key, and keyed head
  anchor (`.vanta/audit.head`) all exist and remain protected, the exercised
  verification path detects tail truncation. Legacy missing-anchor and
  missing-log states are accepted by the current Rust verifier, so unconditional
  tail-truncation detection remains migration work.

## 3. Trust model (untrusted repos)

Vanta is often pointed at a repo you didn't write. A repo can carry config that, if honored
blindly, is remote code execution. **Project-scoped config requires an explicit trust
decision** (the same gate for all of these):

| Surface | Untrusted-project default | Opt-in |
|---------|---------------------------|--------|
| Context files (`CLAUDE.md`, …) | not loaded | trust dialog |
| MCP servers (`.mcp.json`) | not mounted | trust dialog (fail-safe in headless) |
| Plugins | not loaded | `plugins.trustProjectPlugins` + `VANTA_ENABLE_PROJECT_PLUGINS=1` |
| **Hooks (`.vanta/hooks.json`)** | **not loaded** | project trust, or `VANTA_ENABLE_PROJECT_HOOKS=1` |

User-scope config in `~/.vanta` is treated as trusted input. The project-trust
gate blocks the previously demonstrated zero-click cloned-repo path. The
packaged `TRUST-02` proof also exercised restart-bounded hook activation,
scrubbed child environments, protected control state, exact approval, and nine
hostile or unauthenticated local-API requests with no secret exposure. The Rust
legacy missing-anchor contract remains unchanged and explicitly bounded.

## 4. Secrets

- **At rest:** every secret file is `0600` and `.vanta`/its cookie dir are `0700`. The
  `~/.vanta` git store ships a `.gitignore` for token/cookie/key files so a `git add -A`
  can't commit them.
- **In logs:** the kernel event log records tool **status + output length only** — never raw
  tool output — so reading a secret file can't leak it into `.vanta/events.jsonl`. A widened
  `scanForSecrets` + `redactSecrets` (`store/secret-scan.ts`) covers GitHub/AWS/Slack/Google/
  OpenAI/Anthropic/Telegram/Bearer shapes.
- **In `assess()`:** `describeForSafety` sends only the risk-relevant *shape* of an action to
  the kernel (e.g. `"store a login cookie for reddit"`), never the secret value.
- **Secret backends (`secrets/provider.ts`):** `VANTA_SECRET_BACKEND` selects `env` (default),
  `bitwarden` (`bw`), `1password` (`op`), or macOS `keychain`. Non-env backends fetch at
  use-time into an in-memory TTL cache and **never persist plaintext** — adopt one to keep
  tokens out of `.env`/`~/.vanta` entirely.

## 5. Network (SSRF)

Outbound fetchers (`web_fetch`, MCP HTTP transport, reach RSS/Reddit) run through
`net/ssrf-guard.ts` `assertPublicUrl`: non-http(s) schemes and any host resolving to
loopback / RFC-1918 / link-local / `169.254.169.254` (cloud metadata) / unspecified /
IPv4-mapped are refused. `web_fetch` uses `redirect: "manual"` and re-validates every hop
(closes redirect / DNS-rebinding SSRF). `VANTA_ALLOW_PRIVATE_FETCH=1` opts out for
deliberate LAN access.

## 6. Execution & the structural caveat (read this)

**A keyword denylist over an English action description cannot fully contain a shell.** The
kernel's `assess()` sees `describeForSafety`, not the live argv — so a determined,
obfuscated, or interpreter-wrapped command can evade any denylist (`$(...)`, `base64 -d | sh`,
a binary not on the list). The denylist (§2) is **defense-in-depth that raises the bar**, not
an airtight gate.

The sandbox is a second containment layer for `shell_cmd` and `self_correct`
where an OS backend actually applies (macOS seatbelt; Linux bwrap when
installed). Its deny-default filesystem limits path reach to root, writable
zones, and tmp. The supported local proof additionally exercises scrubbed child
environments and protected control state; an untested backend still needs its
own host receipt.

- **Network in the auto-default sandbox stays ON** so `npm install`/`git`/`curl` keep
  working; the FS containment is the default win. Set **`VANTA_SANDBOX_NET=0`** for full
  containment (network denied → reverse shells can't connect out). Reverse-shell *binaries*
  (`ncat`/`socat`/`nc`/`telnet`/`/dev/tcp`…) are additionally denylisted → kernel `Ask`.
- `VANTA_SHELL_SANDBOX=1` — force strict shell sandboxing (network **denied** by default).
- `VANTA_SHELL_SANDBOX=0` — opt OUT (host exec; the kernel denylist is then the only floor).
- `VANTA_SANDBOX=1` — also sandbox `run_code`.
- `VANTA_EXEC_BACKEND=docker` — run shell/code in a container (`--network none` unless
  `VANTA_SANDBOX_NET=1`; mounts the project root + writable zones only).

On a host with **no** sandbox backend (e.g. Linux without bwrap) shell exec falls back to
the host under the kernel denylist (we never brick a platform) — install bwrap or use docker
for containment there.

## 7. Pentest hardening (2026-06-20)

A full multi-surface pentest of the user's own project drove these fixes (all committed,
tests green):

- **CRITICAL** — untrusted-repo hooks RCE → project-trust gate (§3).
- **CRITICAL** — kernel API CSRF (`ACAO: *`, no origin check) → cross-origin `/api/*` refused +
  wildcard CORS dropped + body cap + read timeout + resilient accept loop.
- **CRITICAL** — shell denylist gaps → reverse-shell/persistence/interpreter forms now
  Ask/Block (stop-gap; sandbox is the boundary, §6).
- **HIGH** — symlink escape (in-project symlink → `~/.ssh`/`~/.zshrc`/`permissions.tsv`) →
  file tools canonicalize (realpath) before scope/dangerous-path checks.
- **HIGH** — `acceptEdits` skipped the kernel → it now always `assess()`es (protected-path
  `Block` enforced); only the prompt is skipped for edits.
- **HIGH** — raw tool output written to a world-readable, audit-sealed log → status+length only.
- **HIGH** — `~/.vanta` git store had no `.gitignore` → added.
- **HIGH** — no SSRF guard → `assertPublicUrl` (§5).
- **HIGH (bounded)** — keyed head-anchor verification detects tail truncation
  for initialized, protected stores; legacy missing-anchor/log migration remains
  open (§2).
- **HIGH** — `git push --force` hidden from the kernel (`describeForSafety` was a bare
  `"git push"`) → flags surfaced so the `DATA_LOSS` Block fires.
- **MED** — SSH profile `ProxyCommand`/leading-dash injection → schema rejects them + `--`
  terminates ssh args; `.vanta/` dir + audit key perms; `esc()` control chars; bash-classifier
  was a dead no-op + over-approved credential reads → fixed + hardened.

**Executed June 20 receipts (historical; do not overgeneralize):** kernel `Block` was
monotonic through the exercised TS gate chain; `jsonv.rs` was bounded (no
deep-nest/quadratic/panic); the reviewed paths found no prototype pollution or
ReDoS; the kernel was zero-dependency; and the exercised MCP/plugin and
headless-approval paths failed safe. The exact 2026-08-13 integrated runtime
dependency graph now reports zero npm advisories after compatible dependency
remediation. The static documentation build retains one unpatched `image-size`
denial-of-service advisory through Docusaurus; npm expands it into 19 high
dependent-package entries. It is build-time on repository-authored content,
not code served to visitors, and remains visible pending an upstream fixed
release.

## 7b. Dependency & scan audit (refreshed 2026-08-13)

Full scan with the bundled `security-skills` gate (gitleaks · npm/cargo/osv · semgrep). Triaged by
**reachability before severity** — recorded here so the next audit doesn't re-litigate.

- **Runtime — clean at the exact integrated source head.** `npm audit` reports
  zero vulnerabilities after the compatible dependency refresh and
  `pdfjs-dist` 6.2.108 update. This does not cover a future lockfile or zero-day.
- **Docs site (`vanta-website`, Docusaurus) — all fixable findings remediated.**
  Docusaurus 3.10.2 plus the current js-yaml, nanoid, DOMPurify, Mermaid,
  PostCSS, Undici, fast-uri, and brace-expansion patches are installed. The
  remaining npm result is one `image-size <=2.0.2` advisory with no patched npm
  release; npm reports 19 high entries because the same package flows through
  the Docusaurus graph. It is **build-time** on self-authored repository content
  and is not shipped in the static site output. Keep it visible and update when
  upstream publishes a fixed version.
- **`vanta-ts` dev deps — FIXED.** Migrated to **vitest 3 / vite 6** (+ esbuild `overrides ^0.28.1`),
  clearing every dev-tooling advisory (incl. the vitest 9.8) → `osv-scanner` **0 vulnerabilities**
  (276 packages). The migration's one blocker: vitest 3's module runner only resolves dynamic
  `import()` of files **under the project root**, so the plugin loader's runtime-import test failed on
  an `os.tmpdir()` fixture (minimal-reproduced — IN-REPO imports OK, OS-tmpdir "Cannot find module").
  Fixed by relocating **that test's** fixtures in-repo (`.vitest-tmp/`, gitignored); the production
  `loader.ts` is unchanged. **Full suite 977 files / 11132 tests green** on vitest 3, `tsc` clean.
- **SAST (semgrep) — 0 real.** One hit: a fake AWS key in `cofounder/company-template.test.ts` — a
  **fixture that tests the secret scanner**, allowlisted in `.gitleaks.toml`. Not a credential.

Re-run any time: `./security-skills/scan.sh .` (no agent needed).

## 8. Operator guidance

- **Untrusted repo?** Don't trust it in the dialog; keep `VANTA_ENABLE_PROJECT_HOOKS` unset;
  run with `VANTA_SHELL_SANDBOX=1` (or `VANTA_EXEC_BACKEND=docker`).
- **Autonomous / unattended?** Sandbox on, a spend budget set (`budget` tool / PCLIP), and
  review the audit log (`cargo run -- doctor`, `vanta loop escalations`).
- **Secrets:** prefer a `VANTA_SECRET_BACKEND` over `.env`; never paste a live secret into the
  chat (if you do, rotate it).
- **Verify the chain:** the audit log is tamper-evident — periodically confirm it verifies.

## 9. Reporting a vulnerability

This is a personal project under active development. Report issues privately to
**jason@theft.studio** — do not open a public issue for a security bug. Include repro steps and
the affected surface (kernel boundary, a tool, the trust model, secrets, network, or exec).
