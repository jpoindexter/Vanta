# Corrupt image admission and chat recovery — 17 November 2026

Supporting repair for `DESKTOP-CHAT-IMAGE-FAILURE-RECOVERY`, not closure of the
original tester incident. The repair is source-verified; final signed package,
DMG and installed-copy acceptance are separate delivery gates.

## Reproduced cause

The normal Desktop v0.1.0 package accepted a file named `corrupt.png` containing
plain text as a saved, sendable image. The isolated packaged replay failed its
corrupt-input refusal assertion, with no renderer errors. No live model or
external action was used.

The thumbnail helper intentionally substitutes a transparent placeholder when
image decoding fails, but the admission path still accepted the original bytes:
its earlier checks covered declared MIME, nonempty input and size, not decoding.
A harmless preview fallback therefore concealed invalid source bytes.

## Narrow repair

- PNG/JPEG composer admission now requires the existing browser image decoder
  to produce nonzero dimensions. Failure or an eight-second decode timeout
  returns the existing readable image-read error before source bytes become
  sendable. Decoder handlers, source and timer are released.
- Picked, dropped and pasted image paths use the same admission check. A
  failed new image does not remove the existing file or typed draft.
- Generic transcript-thumbnail fallback stays unchanged. Accepted TIFF behavior
  is retained because Chromium cannot decode every supported TIFF; this repair
  does not certify corrupt-TIFF rejection.
- The existing local-first thumbnail queue/admission seam moved into
  `composer-image-admission.ts`, keeping its public compatibility export. The
  actions file shrank from 924 to 873 lines; no filesystem grant, native guard,
  custody contract, model policy or retry rule changed.

## Executed source proof

Two picked-PNG/pasted-JPEG regressions first failed because the corrupt payloads
remained attached. After the change, the three focused image/action/thumbnail
files passed 54 tests. Additional cases cover successful decoder cleanup,
bounded timeout and retained TIFF/refusal compatibility. Renderer typecheck and
build passed. New helper files have zero size findings; existing actions-file
findings are not worsened. `git diff --check` passed.

From `desktop-next/apps/desktop`:

```sh
../../node_modules/.bin/vitest run \
  src/app/chat/hooks/use-composer-actions.test.ts \
  src/lib/composer-images.test.ts src/lib/image-resize.test.ts
../../node_modules/.bin/tsc -p . --noEmit
```

Actual source Electron replay used an isolated home, profile, project and local
mock provider, with the unchanged approved kernel. Only native picker selection
was supplied by the fixture. It demonstrated:

1. A corrupt PNG is refused while an existing project file and typed draft stay.
2. The unsent file, exact valid PNG bytes and text survive actual quit/relaunch;
   the refused corrupt attachment does not return.
3. The restored file/image request completes in that same chat, followed by a
   completed ordinary text request. The proof waits for the idle Send control,
   not merely a text fragment during streaming.
4. Another chat completes; returning preserves the original transcript without
   transferring the other chat's draft. Zero renderer errors were captured.

This proves the named source replay, not a real-provider interpretation or final
signed DMG. Initial source-fixture setup failures were corrected before these
checks; they are not counted as product acceptance.

## Remaining gates

- Repeat the attachment/restart/other-chat replay against the final extracted
  signed distribution and verify its exact installed identity.
- Establish the original tester build/input/failure; do not infer that the
  counterfeit PNG reproduced the original delayed reset.
- External-project and remote/container ingestion, corrupt TIFF validation,
  larger/oversized failures, unknown-send reconciliation and attachment-triggered
  composer geometry require their own bounded evidence.

Owner data, credentials, existing history and rollback copies were not changed
by this source investigation. The original parent card remains open.
