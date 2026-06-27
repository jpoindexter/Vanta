---
name: secret-scan
description: "Find committed secrets before they ship. gitleaks over full history + staged, Vanta's own secret-scan, plus the remediation order (rotate FIRST, then scrub). Run before any repo goes public or any release tag."
created: 2026-06-27
updated: 2026-06-27
tags: [security, secrets, gitleaks, credentials, pre-commit, leak, scan]
triggers: [{"event":"PreToolUse","match":"git_push"}]
---

# Secret Scan

A leaked secret in git history is leaked **forever** — anyone who cloned has it, and deleting the file in a new commit does nothing. So this scan runs over the WHOLE history, not just the working tree, and the remediation order is **rotate first, scrub second** (scrubbing a still-valid key is theater).

## When to run

- Before a repo goes **public** (the highest-stakes moment — history is about to be world-readable).
- Before any **release tag** (a tagged commit is what people audit).
- As a **pre-commit hook** (catch it before it ever lands).
- After anyone pastes a real secret into a file "just to test."

## Run it

```bash
# 1. Full HISTORY scan — the authoritative one (every commit, not just HEAD).
gitleaks detect --no-banner --redact

# 2. Staged-only — fast, for the pre-commit hook.
gitleaks protect --staged --no-banner --redact

# 3. What's actually TRACKED that shouldn't be (config the regex scan can miss).
git ls-files | grep -iE '(^|/)\.env$|\.pem$|id_rsa|\.p12$|credentials|api-token|\.key$'
```

A clean run prints `no leaks found` and lists the commit count scanned. **Read the count** — `0 commits scanned` means you pointed it at the wrong place, not that you're clean.

## Triage what it finds

- **A real, live secret** → STOP. Rotate it at the provider NOW (revoke + reissue). Only then scrub. A scrubbed-but-valid key is still compromised.
- **A test/example value** → add the file to `.gitleaks.toml` `allowlists` (paths or a regex), don't disable the hook. Example/fixture files (`*.example`, `__fixtures__/`) belong here.
- **A false positive** (npm integrity hash, a UUID, a base64 blob) → allowlist the specific pattern. Don't widen the rule so far it stops catching real keys.

## Remediate (in order)

1. **Rotate** the credential at the source. Non-negotiable, first.
2. **Stop tracking** it: add to `.gitignore`, `git rm --cached <file>`, commit.
3. **Scrub history** only if the secret was committed: `git filter-repo --invert-paths --path <file>` (or BFG), force-push, and tell anyone with a clone to re-clone. Back up the repo first.
4. **Prevent recurrence**: install the pre-commit hook so `gitleaks protect --staged` runs on every commit.

## The boundary

gitleaks is **pattern-based** — it catches credential SHAPES (AWS keys, tokens, private-key headers), not a password that looks like a normal word. It is a strong net, not a proof of cleanliness. Pair it with: `.env` gitignored, secrets fetched at use-time (not persisted), and never echoing a secret in logs. See `[[dependency-audit]]` and `[[security-preflight]]`.
