# Startup repair delivered to normal CLI — 2026-10-28

**Normal `vanta` now selects verified pin `05271e95`. Desktop remains agent6.**
The pin contains runtime repair `4036609c`; its additional commit changes only
the [startup evidence document](startup-cache-generations-2026-10-28.md).
This is local delivery on an unmerged branch, not a public release or tag.

## Identity and preservation

- All **10,436 tracked blobs** match the exact pinned commit. Independent Git
  objects; no alternates or copied uncommitted source work.
- The unchanged runtime dependency lock matches the prior d626 pin. All
  **34,522 dependency files** match by bytes, with directory names, links and
  modes also checked. No new package installation or lifecycle hooks.
- Kernel SHA256: `0a8511a6d09ef67a05e2eb303234792d5fcb6b0cb5a1209fe3b02a2721017a78`.
  Reused from the verified prior CLI, not the different generated debug binary.
- Compiled CLI entry SHA256:
  `6e49e7223080ffde1eb6eab4a696bca546e9b02ad19cfe02df340a4ff1eb5e03`.
  The entry bytes are unchanged; this repair changes compilation publication
  and launcher selection, not that entry's implementation.
- Only the normal saved CLI location changes, after verification. Its original
  contents and the full prior d626 pin remain for rollback. Global wrapper bytes
  are unchanged. No credentials, approval rules or owner profiles are copied.
- Approved nonsecret high-effort/standard-speed defaults remain in the pin's
  ignored nested configuration; no root environment file is introduced. Ambient
  choices still take precedence in the compiled configuration-loader check.
- Original 239 integration files, 13 dirty legacy CLI files and all 43 original
  Git status entries are preserved. The 32-file owner app-data baseline matches.
  This delivery makes no app write and checks its ASAR hash; that is not a new
  independent whole-app fingerprint or notarization assessment.

## Executed paths

1. Three simultaneous first launches run the actual native compiler and shipped
   `run.sh`, initialize ACP, use three distinct compiled generation paths and exit0.
   No final-pin source edit is used to force the rebuild. Warm startup reuses it.
2. Actual compiled CLI, Rust kernel and ACP/MCP/file tools pass **26 checks**:
   exact private draft, one-use fixture approval, refused overwrite and durable
   denied receipt, typed MCP errors, cancellation, protocol output and natural EOF.
3. Five actual worker cases pass: uncertain-effect sibling containment, independent
   success, read-limit completion, held approval with stale reply/fresh rejection,
   and parent Cancel. Every case has a fresh private project/profile and kernel.
4. After atomic cutover, the parent reads the actual owner selection and exercises
   that version through the unchanged global wrapper in a separate private profile.
   It initializes from the compiled generation and exits0 without changing the memo.
5. A **real terminal** starts through that wrapper: first conversation → `/restart`
   → actual process relaunch → visible saved-session reload → second request carrying
   the prior user and assistant messages → expected response → `/quit` exit0.
   The external model is a private scripted loopback fixture, not a live account.
6. All 21 recorded private listener ports are closed afterward. Only owned test
   processes are stopped; no operator process is killed.

Private evidence packet: `Vanta-backups/startup-cli-delivery-20261028-PuJijR`.
`delivery-reviewed-ready.json` seals 33 receipts/scripts after an independent
review added the missing exact Git-status assertion. The original earlier seal
is retained. `delivery-final.json` seals cutover, after-identity and real-terminal
evidence; source and owner-data preservation are independently checked again.

## What remains open

The [installed agent6 Desktop](agent6-installed-2026-10-28.md) still contains d626
code. No new Desktop packaging, signing, notarization, installation, GUI acceptance
or browser/account workflow is implied by this CLI operation. Owner credentials
and real provider routing were not exercised; no claim of a verified business
workflow or complete model intelligence follows from scripted control checks.

The TUI banner still labels its default `127.0.0.1:7788` despite a private kernel
URL override; the actual fixture endpoint and root were separately checked.
This display issue remains, rather than being described as correct routing proof.
The startup cache retains old generations for active readers, has no automatic
garbage collector and does not validate every emitted module's content.

Saved-rule write transactions, wider trust/security, modular seams, full visual,
parity/accessibility, live-account and unfamiliar-person gates remain open.
The [website dependency checkpoint](website-source-map-checkpoint-2026-10-28.md)
retains its own 42-finding audit; this CLI delivery does not rebuild/deploy the
website or clear default-branch alerts. No card is promoted to Done.
