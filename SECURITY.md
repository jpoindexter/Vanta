# Security Protocol — Vanta

Vanta is a **local trusted-operator agent**: it runs on your machine, with your
credentials, and can read/write files, run shell, reach the network, and drive a
browser. That power is the point — so the security model is about *bounding* it, not
removing it. This document is the source of truth for that model, the guarantees it
makes, the ones it does **not**, and how to run it safely.

> Rule Zero: no deletes, overwrites, out-of-scope writes, or secret handling without
> explicit approval — enforced by the kernel on every tool call.

## 1. Architecture: the kernel is the boundary

| Layer | Language | Role |
|-------|----------|------|
| `vanta-kernel` (`src/`) | Rust, zero deps | **Enforced** security boundary — risk classifier, scope/protected-path checks, approvals, tamper-evident audit log, loopback HTTP API |
| `vanta` (`vanta-ts/`) | TypeScript, Node 22 | Agent loop — LLM providers, tools, prompt. **Gates every action through the kernel; cannot bypass it.** |

Every tool call follows: `describeForSafety(args)` → kernel `assess()` → `{Allow | Ask | Block}`.
The TS layer may **tighten** a verdict (rules, auto-mode, operator profile) but can **never
loosen a kernel `Block`**. If the kernel is unreachable the gate **fails closed** (the tool is
blocked, gracefully, not executed).

## 2. What the boundary enforces

- **Risk classification** (`src/safety.rs`) — destructive/data-loss/exfiltration → `Block`;
  exec-vectors, machine/credential config, out-of-scope paths, irreversible ops → `Ask`;
  read-only/reversible in-scope work → `Allow`.
- **Scope containment** (`src/scope.rs`) — canonicalized path containment; `..` traversal,
  sibling-prefix (`/a/vanta-evil` vs `/a/vanta`), and symlink escapes are rejected.
- **Protected paths** — the kernel's own source (`src/*.rs`, `Cargo.toml`/`.lock`),
  `vanta-ts/src/factory/*`, and `MANIFESTO.md` are never writable by the agent.
- **Approvals** (`src/approvals.rs`) — only `Ask` actions queue; `Block` refuses, `Allow`
  runs. Persisted to `.vanta/approvals.tsv`.
- **Tamper-evident audit log** (`src/audit.rs`) — every event is hash-chained
  (`h = sha256(secret_key + prev_h + payload)`); a per-install key (`.vanta/audit.key`, 0600)
  makes edits/inserts/reorders detectable, and a keyed head anchor (`.vanta/audit.head`)
  detects tail-truncation.

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

User-scope config in `~/.vanta` is always trusted (it's yours). Hook gating closed a
zero-click RCE where a cloned repo's `.vanta/hooks.json` ran shell on session start.

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

**The real execution boundary is the sandbox — now ON BY DEFAULT for `shell_cmd` and
`self_correct`** wherever an OS sandbox backend exists (macOS seatbelt — always present;
Linux bwrap — if installed). The sandbox is `deny-default` filesystem (root + writable
zones + tmp only), so a sandboxed command **cannot read `~/.ssh`/credentials or write
outside scope** — secret-exfil-by-file and host tampering are contained by default.

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
- **HIGH** — audit tail-truncation undetectable → keyed head anchor (§2).
- **HIGH** — `git push --force` hidden from the kernel (`describeForSafety` was a bare
  `"git push"`) → flags surfaced so the `DATA_LOSS` Block fires.
- **MED** — SSH profile `ProxyCommand`/leading-dash injection → schema rejects them + `--`
  terminates ssh args; `.vanta/` dir + audit key perms; `esc()` control chars; bash-classifier
  was a dead no-op + over-approved credential reads → fixed + hardened.

**Verified solid (do not regress):** kernel `Block` is monotonic through the whole TS gate
chain; `jsonv.rs` bounded (no deep-nest/quadratic/panic); no prototype pollution; no ReDoS;
npm `0 vulnerabilities`; kernel is zero-dependency; MCP/plugin trust gates fail safe; headless
approver fails closed.

## 7b. Dependency & scan audit (2026-06-27)

Full scan with the bundled `security-skills` gate (gitleaks · npm/cargo/osv · semgrep). Triaged by
**reachability before severity** — recorded here so the next audit doesn't re-litigate.

- **Shipped runtime — CLEAN.** Secrets: gitleaks **0 leaks** over 2003 commits. Runtime deps:
  `npm audit --omit=dev` clean; kernel `cargo audit` clean (zero-dependency). The artifact a user
  installs (`npm install --omit=dev` + the prebuilt kernel) carries no known CVE.
- **Docs site (`vanta-website`, Docusaurus) — 1 high FIXED.** serialize-javascript RCE/DoS
  (GHSA-5c6j / GHSA-qj8w) → forced `overrides` to `^7.0.5` (7.0.6), `docusaurus build` verified.
  The remaining ~26 moderate are **build-time** transitive deps (js-yaml/uuid/webpack) processing
  **self-authored** content — not reachable by a site visitor; no Docusaurus-compatible patch yet.
- **`vanta-ts` dev deps — ACCEPTED (dev-only, unreachable).** vite/vitest/esbuild advisories
  (incl. a vitest 9.8) are **dev/test tooling**, excluded from the shipped artifact by `--omit=dev`;
  the vulnerable paths are dev-server / exposed-API modes, which Vanta's headless `vitest run` does
  not use. The vitest 3 / vite 6 bump clears them but breaks 5 plugin tests → **deferred to a
  deliberate migration**, not blind-bumped (the suite is the gate).
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
