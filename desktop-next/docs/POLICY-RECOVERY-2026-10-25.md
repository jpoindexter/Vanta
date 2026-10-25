# Settings policy recovery — 2026-10-25

## Gap first

Source-only follow-on to installed745629c6. The installed application has NOT
received this change yet. No full local-state/security/card closure is claimed.
Original273 changed/untracked regular files retain their prior hashes.

## Cause and bounded change

The layered settings reader returned empty policy for malformed JSON and invalid
recognized values. Unknown keys beside valid blockedTools also dropped the
whole object. Startup and effect-bearing consumers repeated an empty fallback.

Each user/project/local scope now validates before merging. Unknown preferences
are stripped; invalid recognized values, nonobjects and non-ENOENT read failures
reject with a path-specific recovery message that does not contain file contents.
Only missing optional files default empty. Valid scope precedence is retained.

The settings metadata cache is no longer read or written: its self-selected
manifest/value could bypass source validation. Existing cache files are left
untouched; the path helper remains for diagnostics. Other metadata caches are
unchanged. This trades three small source reads for authoritative policy.

Startup, MCP mount, delegate, plugin reload/source staging and tool setup no
longer swallow these policy failures. Delegate's existing worktree cleanup now
covers settings/MCP setup failure too. This does not add new permission or
change kernel assessment. Plugin source installation is staging, not execution.

## Executed evidence

- Initial15new cases fail against the old reader. Final20policy cases pass:
  all three scopes, malformed/scalar/schema errors, unknown-key preservation,
  old/new/omitted-manifest caches, read failure, startup env, hot reload, redacted
  errors, MCP trust/launch, plugin staging/reload and tool setup.
-141focused tests across13runtime/settings/effect-consumer files pass across
  the recorded runs. Runtime typecheck passes. No full application suite run.
- Independent execution of actual public loadRuntimeSettings and mountMcpServers
  with a private empty environment rejects invalid policy before env application,
  trust, kernel assessment, approval, registration, child launch or network.
  All eight counters zero; launch marker absent; original bytes retained.
  Missing scopes and valid three-layer policy are separately executed.
- Delegate regression executes the public tool with provider/worktree seams
  substituted: worker spawn stays zero and isolated-worktree cleanup runs once.

Receipt: proofs/policy-recovery-2026-10-25/direct.json.

## Remaining / exact re-entry

Do not turn this into a whole recovery claim. Tolerant direct read/modify/write
paths remain in access-mode, config/sandbox actions, plugin CLI and skill-write
approval; git-write reads settings after staging. Fix those as separate narrow
units before claiming all policy writers are protected. Diagnostic-only empty
fallbacks can still misreport status. Atomicity, concurrency/CAS, source symlink
handling, multi-file snapshot races and full app recovery remain open.

No owner settings, live account, MCP process, normal profile, installed app,
Rust/factory/MANIFESTO, Actions, paid service, main merge or release is changed.
