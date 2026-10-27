# CLI startup assets — source checkpoint, 2026-10-27

## Release blocker and correction

The normal launcher selected compiled startup output that omitted the maintained
Fetch bootstrap imported by `cli.ts`. The actual unchanged `run.sh` exited before
ACP initialization with `ERR_MODULE_NOT_FOUND` for
`.startup-cache/desktop-native/runtime-fetch-init.mjs`.

Three source/test files correct the existing compile path: copy the two required
runtime modules with propagated errors, include their source metadata in cache
invalidation, and require both modules plus the compiled CLI before accepting or
promoting output. An incomplete rebuild leaves the previous runnable cache intact.
No compiler bypass, new wrapper, dependency change or blanket cache clearing.

## Executed evidence

Frozen packet: `cli-entry-proof-20261027-bXodwO`, patch SHA256
`d63b79a7f7dff855134c930aad85b2f93c4134a94ff9d6452097a2efb9529c05`.
Parent source packet: `startup-cache-parent-20261027-8kDvOq`.

- The three new cache regressions fail before correction. Afterward the parent
  runs all five focused Node tests using the actual normal CLI Node 22.23.1;
  all pass, retaining the existing failed-build recovery checks.
- The independent private copy of source `73db4498` plus this exact patch executes
  unchanged `run.sh`: cold compile, warm start and an explicit cache hit. The hit
  does not rebuild or alter manifest inode/mtime; required source/output hashes
  agree. Actual child executable identity is checked with `lsof`.
- That entry executes 23 ACP/MCP checks with the unchanged private Rust kernel:
  exact 278-byte read-to-draft output, unchanged refused-overwrite fixture,
  failed-tool protocol status/typed MCP errors, provider-wait cancellation, clean
  JSON-RPC stdout and natural EOF exit 0. Private listeners are gone afterward.

The provider is deterministic and loopback-only. The refused ACP overwrite did
not invoke permission UI and still maps its stop to `end_turn`; that does not
mean the requested effect succeeded. Usage is fixture-supplied, not real billing.
These entry checks precede the later uncertain-effect source slice; joint pinned
delivery verification remains required before selecting an owner launcher.

## Delivery and authority

The owner authorized selecting a pinned updated CLI only after verification.
Normal `vanta` has not been switched by this source checkpoint. Keep the old
checkout, its 13 dirty/untracked files, launcher and remembered selection for
rollback. Do not use the destructive legacy updater or migrate credentials and
approvals. Owner profile/configuration and optional integrations require separate
continuity evidence. Desktop packaging/install remains a distinct path.

No new installed build, main merge, public release/tag or whole-card completion
is claimed.
