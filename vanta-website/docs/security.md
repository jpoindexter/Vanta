---
id: security
title: Security features
sidebar_position: 5
---

# Security features

Beyond the [safety model](./safety-model.md) (the allow/ask/block boundary), Vanta ships several concrete security mechanisms.

## Tamper-evident audit log

Every kernel event in `.vanta/events.jsonl` is chained: each record carries `h = sha256(secret_key + prev_h + payload)`, using a per-install secret key at `.vanta/audit.key` (`0600`). Any edit, insert, delete, or reorder breaks the chain, which `verify_chain()` detects. The secret key means a third party can't forge a valid chain. SHA-256 is vendored (zero-dependency) and verified against NIST test vectors.

## Scope containment

The kernel's `inside_scope(path, root)` is the core file-I/O guard: it canonicalizes paths (symlink- and `..`-aware, with a lexical fallback for paths that don't exist yet), and a trailing-separator check prevents sibling-prefix bypasses (`/root-evil` masquerading as inside `/root`). `references_abs_path_outside_root` scans command text for escape attempts, and `is_protected_path` blocks writes to the kernel source, the factory loops, and the manifesto. This is what makes [`VANTA_ROOT`](./configuration.md) scoping real.

## Threat scanner

The `protect` tool scans text for six threat classes before you act on it:

- scam indicators
- credential / PII exposure
- destructive shell patterns
- social-engineering pressure
- instructions to bypass safety gates (agent overreach)
- contract-trap clauses

Use it on an inbound offer, a suspicious message, or a contract before accepting — it returns a structured threat report.

## Execution sandbox

`VANTA_SANDBOX=1` wraps `shell_cmd` / `run_code` in OS-level isolation (file-access whitelist, optional network block) — see [Settings & secrets](./settings.md#execution-sandbox).

## Secret hygiene

Keys are never logged or echoed; `.env` is gitignored and validated at startup (fail-fast). A pre-commit secret scan (gitleaks) blocks accidental commits. Prefer the [`api_key_helper`](./settings.md#secret-injection-api_key_helper) to keep keys out of files entirely.

## Rule Zero

The backstop: no deletes, overwrites, out-of-scope writes, or secret handling without explicit approval — enforced by the kernel on every tool call.
