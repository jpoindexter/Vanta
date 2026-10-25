# Policy writer preflight — 2026-10-25

Source-only follow-on to POLICY-RECOVERY-2026-10-25.md. Installed745629c6 is
unchanged; full writer/atomic recovery, Desktop/Git trust and card closure are
not claimed.

## Two bounded causes

git_commit previously staged all changes before reading settings. A policy
failure therefore rejected the operation only AFTER changing the index.
The same existing settings/attribution/trailer preparation now precedes the
same git add. Approval, isolated Git broker, arguments and commit behavior
remain unchanged. No factory/Rust/kernel modification.

setSkillWriteApproval previously tolerated corrupt user settings, then replaced
them before checking layered policy. It now validates first and reuses the
existing strict updateUserSettings helper, retaining valid unknown keys and
sibling skills. Its existing post-write load remains. Shared new-file creation
uses0600, preserving the prior setter's protection; existing file mode is not
changed. All three current helper callers were inspected.

## Executed evidence

- Git regression: before4failed/1passed; after5pass, using the actual public
  git_commit tool and disposable repositories. Malformed user/project/local
  policy and invalid blockedTools preserve exact index bytes, staged binary
  diff, porcelain status, HEAD and source bytes. Valid policy still commits with
  attribution. Existing approval and Git-broker fixtures also pass.
- Setter regression: before7failed/2passed. Permission regression separately
  reproduced0644instead of0600; final9setter tests pass. Corrupt scopes/schema
  preserve bytes, valid unknown/sibling keys remain, missing defaults/on-off
  and0600creation execute. Queue/CLI/helper tests also pass.
- Combined parent run39tests/eightfiles passes. Actual independent public setter
  source proof: proofs/policy-writers-2026-10-25/skill-setter.json.

No live repo/account/profile, real external Git remote, MCP process, package or
installed-app test. Git effects occur only in private test repositories.
Remaining: tolerant writers in access-mode, config/sandbox actions and plugin
CLI; atomic writes, source races/symlinks and concurrent-writer/CAS behavior.
