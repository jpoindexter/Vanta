# Loaded runtime dependency migration — source checkpoint

## Verdict

The authoritative runtime source and its local dependency tree now use Zod
4.6.7 and OpenAI 6.49.0. A fresh production-only npm audit reports zero
findings, down from the preceding two high runtime findings. The actual source
Desktop chat/stream journey passes against the rebuilt runtime. This is not a
new signed/installed app or a claim that all Vanta dependencies are secure.

## Compatibility work

- Explicit string keys preserve the old one-argument record contracts; value
  validators were not widened. No compatibility alias or schema bypass.
- Loop stop defaults use prefault so nested defaults still materialize.
- Required/numeric Company messages retain their existing application wording.
- Recording clock validation still checks the function's returned number.
- Runtime address validation retains IPv4/IPv6 support without allowing hostnames.
- SDK support is the existing chat-completions adapter. No Responses API or
  provider/account migration is bundled into this change.

The exact 35-file source patch was reviewed and every before/after hash checked.
Lock changes are precisely 25 entries: root OpenAI/Zod declarations, those two
package entries, and 22 optional-peer dev-to-devOptional metadata changes. Parent
comparison confirms those 22 preserve all versions/dependencies/integrity and
that unrelated root declarations did not change. No factory or Rust source
was edited by this migration. Existing validation is not relaxed to pass tests.

## Parent-executed evidence on canonical source

- Real-SDK loopback requests, SSE tool fragments/usage, HTTP rejection and
  cancellation, plus bounded defaults/collections/clock/Company/session/runtime
  profile schema checks: **20 passed in seven files**. No external provider or
  owner credential was used. A settings/schema.test.ts filter matched no file;
  settings defaults are covered only by the migration-contract assertions,
  not a dedicated settings suite or exhaustive historical payload replay.
- Runtime typecheck and startup compile passed. Runtime bundle rebuilt with
  339 chunks; Electron main/preload rebuilt and Electron typecheck passed.
- Changed production size ratchet: 28 files, zero new/worse findings and one
  unchanged inherited finding. No baseline edits/suppressions.
- Actual source Electron `native-gateway-owner.mjs`: four checks passed,
  exactly one intentional loopback model request, zero renderer errors. It
  checks owner-pinned streams, exact completed-reply persistence and refusal
  of wrong-profile/foreign-device streams. This is the existing single-host
  path, not acceptance of the still-private profile pool.
- Fresh local runtime npm audit: production **0**; all dependencies **9**
  (**2 critical, 6 high, 1 moderate**). These graphs are not additive, and zero
  production npm findings is not exploit absence or GitHub alert closure.

The private migration worker additionally retained 732 distinct targeted checks,
type/startup/bundle/architecture and before/after audit evidence. Those are
worker-executed private results, not a newly repeated full canonical suite.

## Preservation and dependency isolation

Private migration packet:
`/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-backups/zod4-core-migration-20261027-YMok45`.
Frozen patch SHA256:
`08bc946a9cebbd6e56f3ef8f2bec8924f0d07b381bf8ae4ee0f25202a69200b6`.

Parent integration packet:
`/Users/jasonpoindexter/Documents/GitHub/docs/Vanta-backups/combined-desktop-20261027-E6wbNw`.

- Existing source preimages: `before-loaded-core/`; exact after-images:
  `verified-loaded-core-source/`.
- Previous actual canonical dependency directory retained, not deleted:
  `previous-canonical-node_modules/` (rename back to node_modules for rollback).
- Profile worker explicitly released the canonical runtime dependencies after
  moving its private symlink to `original-runtime-deps/node_modules/`, a
  separately preserved old-version copy. The literal node_modules basename is
  necessary for Node's nested bare-package resolution; an earlier wrapper name
  failed resolution without changing or losing package files.
- New canonical dependencies are a separate APFS clone of the privately
  installed/tested tree. No shared Desktop dependency change or new dependency
  install was performed during this handoff.
- Native evidence: `loaded-core-native-chat/result.json`. All 239 original
  preserved work-file hashes remain unchanged. Installed recovery2 is untouched.

## Not established

No new package/signing/notarization/installation, full application suite,
live-account inference, local-ML download, mobile/hardware or owner acceptance.
Full profile/custody integration remains held for its independently reproduced
ownership/default-identity cases. The final combined packet must preserve these
35 migrated source paths rather than overwrite them from its older snapshot.
Desktop/website/development dependencies and wider trust gaps remain separate;
the last GitHub push still reported 170 default-branch alerts. No security-green
verdict, card completion, main merge, tag/release, paid/CI change or legacy
deletion follows from this checkpoint.
