# Settings policy recovery — 2026-10-25

## Gap first

The original source-only receipt below preceded the later installed `536e17fb`
delivery. A new source-only CLI ordering follow-on is recorded in
[CLI-POLICY-PREFLIGHT-2026-10-25.md](CLI-POLICY-PREFLIGHT-2026-10-25.md).
It has not been packaged or installed. No full local-state/security/card closure
is claimed. Original273 changed/untracked regular files retain their prior hashes.

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

Follow-ons through `4a2f4ab8` now preflight Git staging and skill approval, guard
direct writer targets and incoming policy, stop plugin uninstall before its
effect, and surface initial/late terminal settings errors. See
POLICY-WRITERS-2026-10-25.md, TARGET-WRITER-GUARD-2026-10-25.md and
SETTINGS-RECOVERY-UI-2026-10-25.md. This does not make recovery transactional.

Historical ordering gap, now addressed in the source-only follow-on above: `runCli` started kernel
prewarm before `prepareRun` loads capabilities/settings, and `prepareRun`
consumed/bootstrapped that kernel first. The executed `loadRuntimeSettings` proof
above establishes its own boundary, not zero kernel effects for an entire CLI
launch. A fake kernel or `--help` path cannot establish that missing criterion.
The shipped export proof also cannot execute private/inlined startup helpers.
The new public CLI dispatch evidence is separate; exact packaged/installed
acceptance remains open. No all-startup-operations no-effect claim is made.

Diagnostic-only fallbacks, atomicity, concurrency/CAS, source symlink handling,
multi-file snapshot races and full application recovery remain open.

No owner settings, live account, MCP process, normal profile, installed app,
Rust/factory/MANIFESTO, Actions, paid service, main merge or release is changed.
