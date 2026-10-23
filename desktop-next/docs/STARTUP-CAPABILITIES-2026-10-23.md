# Optional startup capabilities — 2026-10-23

## Executed outcome

The exact staged source Electron app starts, sends a chat and displays the model
reply, then opens Plugins with zero renderer errors. Both optional native reads
are absent, not rejecting functions. The unavailable plugin-folder control is
absent; the remaining shared control is keyboard reachable. Seven actual checks
passed against the isolated index candidate. This is not installed-app proof,
full desktop acceptance, native plugin installation or remote-display detection.

## Root cause and minimal correction

The bridge advertised desktopPluginsRoot and getRemoteDisplayReason as callable
unsupported stubs. The renderer's optional startup reads called them as if they
were capabilities, producing rejected promises on every launch. The pre-change
real-app run at aHQbkb reproduced both exact errors before any production edit.
Its baseline JSON, screenshot and `/tmp/vanta-startup-before.log` are retained.

- The shell-specific bridge adapter omits these two unimplemented optional reads.
  Existing callers already handle absent methods. Real implementations still
  win through the existing merge. No fabricated root path or remote-display
  result, no blanket catch/log filter, no new capability registry or IPC.
- The Plugins folder button renders only when the root capability exists.
  The supported-shell regression still opens the returned directory. No working
  operation was removed or new primitive, token, copy or locale added.
- Explicit unsupported operations still reject; the negative bridge test checks
  probePluginRepo rather than pretending all native capabilities work.
- The generated surface manifest is unchanged. Its referenced generator is not
  present in this checkout; shell-specific optionality belongs in the adapter,
  not a manual rewrite of generated inventory or weaker global stub behavior.

Design principles: single source of truth for availability, progressive
disclosure and distinct absent/error states. Unsupported technical controls do
not belong in the default experience; genuine operation failures remain visible.

## Narrow executed checks

| Check | Observed result |
| --- | --- |
| Bridge regression tests | 3 passed / 1 file; both optional reads failed before fix |
| Plugins caller tests | 35 passed / 1 file; missing-folder case failed before fix |
| Exact-index source build | Exit 0, 339 runtime chunks |
| Actual candidate startup/chat/Plugins | 7 checks, exit 0, zero renderer errors, one local model request |
| Renderer TypeScript | Exit 2: inherited missing session-resume-active-turn.json fixture only |
| Staged size ratchet | Two production files; six inherited violations, none new/worse |
| Brand/design guards | Zero brand matches; no new/worse design counts |
| Proof syntax and diff whitespace | Exit 0 |

One early test used the wrong folder accessible name and picked an already
implemented method as its negative control. Both test assumptions were corrected
before production edits; the corrected regressions reproduced the actual
availability defect. A formatter applied unrelated defaults; only our changes
on the initially clean files were removed and reapplied narrowly. No formatter
churn or size-baseline increase is included.

From desktop-next/apps/desktop:

```sh
npx vitest run --project electron electron/vanta/bridge-startup.test.ts
npx vitest run --project ui src/app/capabilities/plugins/plugins-tab.test.tsx
npx tsc -p . --noEmit
```

From desktop-next:

```sh
node tools/build-vanta.mjs
node tools/proof/startup-capabilities.mjs
node tools/brand/brand-scan.mjs
node --check tools/proof/startup-capabilities.mjs
git diff --check
```

Proof root: /var/folders/rj/nj_9qs2s7zs52nsc90yl2q700000gn/T/vanta-desktop-8VoqzS.
Own HOME/VANTA_HOME/project/userData/kernel port, local scripted model, existing
source-launcher kernel dependency. Candidate:
/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-backups/startup-candidate-20261023-Dsm2Rp.
Only selected index files plus existing dependency/kernel symlinks were used;
other dirty navigation and styling work cannot silently supply this result.
Report and screenshots: proofs/startup-capabilities-2026-10-23/.

## Preservation, backup and limits

Pre-edit verified backup:
/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-backups/startup-20261023-9f1dmW/.
It contains a complete branch bundle, binary tracked patch and non-ignored
untracked archive with SHA-256 values recorded in the task output. No retention
deletions, stash, reset, force-push or branch cleanup. A post-commit source backup
also includes the remaining dirty work. Normal profile data and credentials are
not part of these source backups.

All 273 pre-existing dirty/untracked files are retained and byte-identical;
the touched production/UI-test/docs files began clean or are new. The four
handoff-protected files and older proof folders are not staged.

No install, main merge, PR edit, tag, release, CI enabling, protected factory,
Rust, account, paid model or owner-gated action. No native plugin support,
remote-display detection, installed/macOS accessibility, full-suite or whole
DN-22/DN-29 completion claim. The inherited renderer fixture issue and dependency
alerts remain. Continue the next dependency-ready narrow engineering slice;
parked research and owner-gated work stay parked.
