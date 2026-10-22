# Audit 2026-10-22: dependencies, secrets, size rules, profile migration

## Secrets (DN-DEP)

`gitleaks git --log-opts origin/main..HEAD`: 373 commits scanned (70 MB), no leaks. Covers the pushed rebrand commit.

## Dependencies (`npm audit --omit=dev`)

Before: desktop-next 23 (3 critical, 8 high); vanta-ts 8 (1 critical, 3 high).

Done in desktop-next (uncommitted, not yet rebuilt):
- Removed `simple-git` (2 criticals). Declared in `apps/desktop/package.json` but never imported anywhere. The lock lost 20 packages (its tree), added none.
- `dompurify` 3.4.13 to 3.4.17 (patch). The advisories cover `IN_PLACE` mode and `afterSanitize` hooks; the app uses neither (grep), so exposure was low, but the bump is free.
- After: 20 total, 0 critical. The lock was regenerated in a clean temp copy because `npm audit fix` crashes on the symlinked `node_modules`.
- Not verified: a build with these two changes. The installed build 6 still has the old versions. Needs a rebuild and a done-path run before it counts.

Left alone:
- `get-windows` (high, optional native, no fix exists): used only for the read-window-below tool. Accept.
- Remaining highs in desktop-next are transitive build tooling (`node-gyp`, `make-fetch-happen`, `http-cache-semantics`) with no fix path: accept, they do not ship in the runtime.
- vanta-ts `@capacitor/ios` (critical, direct): not imported by any runtime source; it belongs to the iOS shell build. Move to devDependencies or park. Not changed (different package, no rebuild path here).

## Size rules (`vanta lint` limits: file 300, function 50, params 4, complexity 10; tests and .d.ts exempt)

Soft limits (file 200, function 30) are not enforced by the gate; measured here for information. There is no 150 limit in the rules on record.

| Area | Files | Over hard limit | Over soft limit |
|---|---|---|---|
| vanta-ts | 2184 | 6 files, 42 functions, 94 complexity, 31 params | 113 files, 425 functions |
| desktop electron | 107 | 5 files, 21 functions, 12 complexity | 23 files, 75 functions |
| desktop renderer | 1881 | 333 files, 1263 functions, 842 complexity, 88 params | 510 files, 2516 functions |
| desktop other | 37 | 6 files, 13 functions, 10 complexity | 8 files, 19 functions |

Reading it:
- vanta-ts is close to the rules (the earlier grind took it from 70 violations to single digits; the residue is functions and complexity).
- The desktop renderer is not. It is the imported upstream code. 333 oversized files include data, not logic: the i18n files (4,900 to 5,700 lines each) and a generated gateway contract (6,097 lines) are data and should be exempted, not split.
- Biggest real code files: `quick-entry.ts` 501, `channel-protocol.ts` 489, `effect-persistence.ts` 539, `json-rpc-gateway.ts` 741.
- Practical effect: the pre-commit gate blocks any commit touching a file that already violates. That is why the stripe edit to `sidebar.tsx` (676 lines) could not be committed normally.

Proposal (needs owner OK, it changes a guard): a ratchet like the design scan. A baseline of existing violations per file; the gate blocks only a staged file that gets worse, and exempts i18n and generated files. New code stays under the limits; old code is not a wall.

## Build 6 on the real profile

First launch of the installed app on the real profile: the process started and the storage-key migration ran. `vanta.*` key occurrences went from 2 to 52; checked individually: composer model, theme, onboarding and active profile now exist under `vanta.*`. Old `hermes.*` keys are still present (the migration copies; it does not delete). Not seen: the UI itself (chats visible, settings intact) since this was read from disk, not looked at.
