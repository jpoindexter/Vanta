---
id: security
title: Security
sidebar_position: 5
---

# Security

Vanta is a **local trusted-operator agent**: it runs on your machine, with your credentials, and can read/write files, run shell, reach the network, and drive a browser. That power is the point — the security model **bounds** it, it doesn't remove it. This page summarizes the model and the [2026-06-20 pentest](#pentest--findings--fixes-2026-06-20); the full source of truth is [`SECURITY.md`](https://github.com/jpoindexter/Vanta/blob/main/SECURITY.md) in the repo.

> **Rule Zero** — no deletes, overwrites, out-of-scope writes, or secret handling without explicit approval. Enforced by the kernel on every tool call.

## The boundary: a separate Rust kernel

Every tool call goes `describeForSafety(args)` → kernel `assess()` → **Allow / Ask / Block**, out of process. The TypeScript agent loop can *tighten* a verdict (rules, auto-mode, operator profile) but can **never loosen a kernel Block** — and if the kernel is unreachable the gate **fails closed** (blocked, gracefully). The kernel enforces:

- **Risk classification** — destructive / data-loss / exfiltration → `Block`; exec-vectors, credential/system config, out-of-scope paths, irreversible ops → `Ask`; read-only / reversible in-scope work → `Allow`.
- **Scope containment** — canonicalized path containment; `..` traversal, sibling-prefix (`/a/vanta-evil` vs `/a/vanta`), and symlink escapes are rejected.
- **Protected paths** — the kernel's own source, `vanta-ts/src/factory/*`, and the manifesto are never agent-writable.
- **Tamper-evident audit log** — every event is hash-chained (`h = sha256(secret_key + prev_h + payload)`) with a per-install key (`.vanta/audit.key`, `0600`); edits, inserts, reorders, and tail-truncation are all detectable.

## The execution boundary — the honest part

A keyword denylist over an English action description **cannot fully contain a shell.** `assess()` sees the *description*, not the live argv, so an obfuscated or interpreter-wrapped command (`$(...)`, `base64 -d | sh`, an off-list binary) can evade any denylist. The denylist is **defense-in-depth that raises the bar — not an airtight gate.**

**The real execution boundary is the sandbox — ON BY DEFAULT** for `shell_cmd` and `self_correct` wherever an OS sandbox backend exists (macOS seatbelt — always present; Linux bwrap — if installed). It's **deny-default filesystem** (project root + writable zones + tmp only), so a sandboxed command **cannot read `~/.ssh` / credentials or write outside scope** — secret-exfil-by-file and host tampering are contained by default.

- Network in the auto-default sandbox stays **on** (so `npm install` / `git` / `curl` keep working); the filesystem containment is the default win. Set **`VANTA_SANDBOX_NET=0`** for full containment (no outbound → no reverse shell). Reverse-shell binaries (`ncat`/`socat`/`nc`/`/dev/tcp`…) are additionally denylisted → `Ask`.
- `VANTA_SHELL_SANDBOX=1` forces strict shell sandboxing (network denied by default); `VANTA_SANDBOX=1` also sandboxes `run_code`; `VANTA_EXEC_BACKEND=docker` runs in a container (`--network none` unless `VANTA_SANDBOX_NET=1`).
- On a host with **no** sandbox backend, shell exec falls back to the host under the kernel denylist (we never brick a platform) — install bwrap or use docker for containment there.

## Trust model — untrusted repos

Vanta is often pointed at a repo you didn't write, which can carry config that's remote code execution if honored blindly. **Project-scoped config requires an explicit trust decision:**

| Surface | Untrusted-project default | Opt-in |
|---|---|---|
| Context files (`CLAUDE.md`, …) | not loaded | trust dialog |
| MCP servers (`.mcp.json`) | not mounted | trust dialog (fail-safe headless) |
| Plugins | not loaded | `plugins.trustProjectPlugins` + `VANTA_ENABLE_PROJECT_PLUGINS=1` |
| Hooks (`.vanta/hooks.json`) | **not loaded** | project trust / `VANTA_ENABLE_PROJECT_HOOKS=1` |

User-scope config (`~/.vanta`) is always trusted (it's yours). Hook gating closed a zero-click RCE where a cloned repo's `.vanta/hooks.json` ran shell on session start.

## Secrets & network

- **Secrets at rest** — secret files are `0600`, `.vanta` and its cookie dir `0700`; the `~/.vanta` git store gitignores token/cookie/key files. The event log records tool **status + output length only** — never raw output — so reading a secret file can't leak it into `.vanta/events.jsonl`. `describeForSafety` sends only the *shape* of an action to the kernel, never the secret value. Optional `VANTA_SECRET_BACKEND` (bitwarden / 1password / macOS keychain) keeps tokens out of `.env` entirely.
- **SSRF** — outbound fetchers (`web_fetch`, MCP HTTP, reach) run through `assertPublicUrl`: non-http(s) schemes and any host resolving to loopback / RFC-1918 / link-local / `169.254.169.254` (cloud metadata) are refused, and every redirect hop is re-validated (DNS-rebinding closed). `VANTA_ALLOW_PRIVATE_FETCH=1` opts out for deliberate LAN access.

## Pentest — findings & fixes (2026-06-20)

A full multi-surface pentest drove these fixes — all committed, tests green:

**Critical**
- Untrusted-repo `hooks.json` RCE → project-trust gate.
- Kernel API CSRF (wildcard CORS, no origin check) → cross-origin `/api/*` refused; CORS dropped; body cap + read timeout.
- Shell denylist gaps (reverse-shell / persistence / interpreter forms) → `Ask`/`Block` (stop-gap — the sandbox is the real boundary).

**High**
- Symlink escape (in-project symlink → `~/.ssh`) → file tools canonicalize (realpath) before scope checks.
- `acceptEdits` skipped the kernel → it now always `assess()`es (protected-path `Block` enforced).
- Raw tool output written to a world-readable, audit-sealed log → status + length only.
- `~/.vanta` git store had no `.gitignore` → added.
- No SSRF guard → `assertPublicUrl`.
- Audit tail-truncation undetectable → keyed head anchor.
- `git push --force` hidden from the kernel → flags surfaced so the `DATA_LOSS` Block fires.

**Medium** — SSH `ProxyCommand` / leading-dash injection rejected; `.vanta` + audit-key perms; control-char escaping; a dead bash-classifier fixed.

**Verified solid (do not regress):** kernel `Block` is monotonic through the whole gate chain; the JSON parser is bounded (no deep-nest / quadratic / panic); no prototype pollution; no ReDoS; npm **0 vulnerabilities**; the kernel is **zero-dependency**; MCP/plugin trust gates fail safe; the headless approver fails closed.

## Other concrete mechanisms

- **`protect` tool** — scans inbound text (an offer, a message, a contract) for six threat classes — scam indicators, credential/PII exposure, destructive shell patterns, social-engineering pressure, safety-bypass instructions, contract-trap clauses — and returns a structured report before you act on it.
- **Pre-commit secret scan** — gitleaks blocks accidental secret commits; `.env` is gitignored and validated at startup (fail-fast).
- **`api_key_helper`** — fetch keys at use-time to keep them out of files entirely.

See also the [safety model](./safety-model.md) (the allow/ask/block verdict logic) and the [kernel](./kernel.md) internals.

## Reporting a vulnerability

This is a personal project under active development. **Report privately to [jason@theft.studio](mailto:jason@theft.studio)** — please don't open a public issue for a security bug. Include repro steps and the affected surface (kernel boundary, a tool, the trust model, secrets, network, or exec).
