# Refuse destructive settings fallback — 2026-10-25

Delivery follow-on: source745629c6 installed; its actual shipped setSkillEnabled
also refuses corrupt temporary settings and retains the exact bytes, zero
network/subprocess calls. PARALLEL-DELIVERY-2026-10-25.md holds installed proof;
no owner settings or whole recovery-boundary acceptance implied.

## Reproduced public path

readUserSettingsRaw converted malformed/non-object JSON and every read failure
into an empty object. A later setSkillEnabled/updateUserSettings mutation then
overwrote the existing file, silently dropping its blockedTools and other keys.
This was reproduced with synthetic temporary state, not the owner's profile.

The read/modify/write seam now treats only ENOENT as new settings. Invalid
objects or other read failures stop before the mutation callback and identify
the file needing recovery. Existing suspect bytes are left untouched. Valid
unknown keys and normal missing-file creation remain supported. No recovery
framework, automatic policy reset, new dependency or production caller change.

## Executed evidence

- Before: six failures/one pass on the new regression. After:35tests/four files
  pass (user-edit7, Desktop tools API4, skills API7, overrides17).
- Runtime typecheck and scoped diff check pass.
- Direct public setSkillEnabled on truncated synthetic settings rejects with
  recovery error. Before/after SHA256 both
  `5e9d3ed4ebc11b262821add03f36792bd5767e4e3d9114d85dc6be77baa46fbe`;
  only the original settings.json remains. See
  `proofs/settings-recovery-2026-10-25/direct.json`.
- Tests also cover arrays/null/scalars and a non-ENOENT read failure, skipped
  mutation callbacks, preserved valid keys and new-file behavior.

Caller scope: Desktop tools-api toggle and skills enable-state writer/reader;
tools/recall.ts also reads skill overrides and already catches/surfaces recovery
failure without a production caller change.
No owner settings, live network, credential, UI or installed runtime was used.
This is source acceptance only until the next combined package.

LOCAL-STATE-ATOMIC-RECOVERY-BOUNDARY remains Next. General layered settings reads
still tolerate corruption separately; atomic writes, concurrency/CAS, symlink
protection and full recovery/migration are not established by this patch. Do
not claim the entire state boundary closed or replace existing recovery data.
