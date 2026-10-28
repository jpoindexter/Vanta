# MCP request correlation — 2026-10-28 source checkpoint

Delivery update: [agent11](agent11-installed-2026-10-28.md) now includes this repair
and passes it against actual candidate/installed compiled exports. Normal CLI70
remains older. The source-checkpoint boundaries below are historical, not erased.

Done for this slice means a server request using an outstanding client request's
ID receives its own response without settling that client call; only the actual
tool response may settle the mapped effect. This is not whole-agent acceptance.

## Cause and repair

The shared MCP client looked up pending IDs before classifying server requests.
Both peers choose IDs independently. A same-ID `elicitation/create` or unsupported
server request therefore resolved a pending tool call with undefined, which the
mapper could record as empty confirmed output. A later real rejection was lost.

Dispatch now routes server requests before correlating replies. Notifications,
safe elicitation cancellation, unsupported-method errors, ordinary successful
results, explicit tool errors and terminal-transport behavior keep their existing
paths. No retry, timeout, approval, allowlist or kernel policy is added or relaxed.
The shared fix reaches stdio/HTTP clients used by mounting and connector setup.

## Executed evidence

- Three deterministic regressions failed before the repair: both same-ID request
  variants settled too early, and a later RPC error became empty success.
- The narrow final MCP set passed 88 tests in eight files, including the existing
  client, terminal lifecycle, tool-error, HTTP, mount and server checks.
- Two new real child-process stdio cases execute the actual client and mapped
  tool/effect journal. The fixture asks a same-ID question and waits for cancel.
  Before releasing the real tool response, the call remains pending and its
  journal has no confirmation/acknowledgment. After release, actual text returns
  confirmed; explicit failure remains unknown and same-operation replay is refused.
- Scoped TypeScript 6.0.3 checks of three touched source/test files and global/
  compiler options report zero diagnostics; strict source-size checks report zero
  findings. An initial missing test-context approval callback was corrected; that
  failed receipt is retained separately. This is not a full runtime typecheck.
- Independent read-only review found no blocker in this scoped diff.
- Original 239 integration files, 13 dirty legacy CLI files, 32 owner-data files,
  installed agent10 ASAR and normal CLI70 selection remain unchanged.

Private evidence: `Vanta-backups/mcp-correlation-20261028-D7SaTE` contains the
preimage, original failing output, focused/stdio outputs and preservation/type/
size receipts. No owner credentials or real external MCP service were accessed.

## Remaining boundaries

The stdio server is a deterministic fixture; its action gate is a test stand-in,
not new Rust-policy, live-account, model-planning or connected-client proof.
Installed agent10 and pinned normal CLI70 do not yet contain this source repair.
Remote cancellation, universal timeouts, malformed-message hardening, full trust/
security acceptance and full Desktop parity remain open. No card is completed;
IDs, statuses, Done contracts and dependencies stay unchanged. No main merge,
release/tag, CI, paid service, protected source edit or legacy retirement occurs.
