# Desktop YAML dependency patch — 2026-10-29

## Result and scope

Desktop's declared `yaml` dependency changes from 2.8.1 to 2.8.3, the minimum
patched release for [GHSA-48c2-rrv3-qjmp](https://github.com/advisories/GHSA-48c2-rrv3-qjmp).
The [upstream release](https://github.com/eemeli/yaml/releases/tag/v2.8.3) catches
stack exhaustion during node composition. No new dependency or Node floor is
introduced. Source changes are limited to the exact direct pin, workspace-lock
pin and one lock entry's version/resolved/integrity, plus a focused regression.
Every other manifest/lock field is structurally unchanged.

The shared Desktop parser directory now contains the verified 2.8.3 artifact;
its original 2.8.1 directory is retained for rollback. Before replacement its
233 files matched the official old package, ruling out local edits within that
directory. Shared dependencies were not reinstalled wholesale. The normal CLI
12c05ed5, installed signed/notarized agent16 and their rollback remain unchanged.

This is dependency maintenance, not demonstrated app exploitability. No
first-party `yaml` import was found in the inspected Desktop source. A production
dependency declaration does not prove that its vulnerable parser is reachable
in the installed app. No YAML consumer, attack route or installed remediation is
inferred from the package name or successful build.

## Executed evidence

- Both official npm archives match their SHA-512 integrity values and verify
  against registry ECDSA signatures. This establishes artifact identity, not that
  all upstream code is harmless.
- A bounded 1,201-byte input with 600 nesting levels, evaluated in a private
  child with a reduced stack and 64 MB heap ceiling, produces a raw `RangeError`
  on 2.8.1 and a `YAMLParseError` with `RESOURCE_EXHAUSTION` on 2.8.3. All three
  public parsing APIs are exercised. This is not an OOM, stress, default-stack
  threshold or installed-host exploit test.
- Ordinary parsing, anchors/merge handling, multiple documents and stringify/
  parse round trips pass on both official packages. The independently installed
  2.8.3 instance matches all 233 signed-artifact file hashes and repeats the
  patched error/ordinary controls successfully.
- A fresh physical Desktop dependency tree installs with ordinary `npm ci
  --ignore-scripts`, no forced/legacy-peer flags and no copied upstream lock.
  1,040 packages install; source manifests and lock remain unchanged afterward.
- The existing Desktop build command succeeds in that private workspace:
  renderer, Electron main/preloads and 340-chunk runtime bundle. The unchanged
  Electron binary download is explicitly skipped; runtime compiler dependencies
  are an independent APFS clone of the existing runtime tree. This is not a fully
  hermetic install of every runtime dependency, packaged executable, notarization
  or installed interaction proof.
- Four retained regression checks pass against both the private installed parser
  and the newly activated shared parser. The new test file passes strict size
  analysis. No full application suite or unrelated real-account flow was rerun.

## Current audit boundary

Near-simultaneous before/after audits use manifest/lock-only directories, no
installed dependency tree, the same registry and explicit no-credential config.

| Desktop graph | Before | After |
| --- | --- | --- |
| Production | 12: 4 moderate, 8 low | 11: 3 moderate, 8 low |
| All | 18: 6 high, 4 moderate, 8 low | 17: 6 high, 3 moderate, 8 low |

Only the YAML finding disappears. All remaining advisory identities, ranges,
severity, affected nodes and dependency relationships are identical. npm's
suggested remediation route for an unrelated KaTeX finding differs in the all
report; that suggestion is retained separately, not counted as a fix. Both
after-audits still exit one. Graphs overlap and must not be added together.

Separate current lock-only refreshes report zero known npm findings in the agent
runtime graph and 33 in the website graph, including 16 critical meta-findings.
Those are database/lock observations, not full ecosystem, installed-closure,
reachability or security acceptance. GitHub's 179 default-main alerts are a
different graph and are not cleared by an unmerged feature-branch patch.

## Failures retained rather than hidden

The first private candidate's context-free version hunk matched `tslib` rather
than the YAML entry. Clean installation refused the inconsistent lock. The
shared checkout was untouched; an entry-keyed repair and a structural check now
prove that only the five allowed manifest/lock fields differ. The failed private
lock, patch and install report are retained. A second audit assertion initially
compared npm's changing KaTeX remediation suggestion as if it were an advisory
change; explicit comparison now preserves that difference and separately proves
unchanged security findings. No production policy or test was weakened.

## Preservation and remaining work

Original 239 integration files, 13 legacy CLI files, 32 owner-data baseline files
and 47 dirty status entries remain preserved. All 13 tracked manifest/lock files
are inventoried; only the two declared files change. Preimages, old parser,
signed artifacts, raw audits, install/build logs and Git delta bundle are retained.

Canonical Desktop cutover notes and DN-DEP record this bounded maintenance
checkpoint without changing status, Done criteria, dependencies, checklist or
WIP. No installed app replacement, normal CLI change, main merge, public
release/tag, protected-source edit, paid CI/service or capability removal occurs.
Broader Desktop/website dependency findings, trust/review-clearing, modularization,
owner/parity/human/live-account/native/voice acceptance remain open.
