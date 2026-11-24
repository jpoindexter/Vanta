# Corrupt image admission and chat recovery — 17 November 2026

Supporting repair for `DESKTOP-CHAT-IMAGE-FAILURE-RECOVERY`, not closure of the
original tester incident. The repair is executed in source and the signed
v0.1.1 isolated installed copy. Normal-profile installation, native updater
replacement and DMG delivery remain separate gates.

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

The existing delayed-preview scope regression also needed an explicit successful
browser `Image` fixture: JSDOM does not perform that decode. Its exact focused
case first failed after the admission timeout, then passed with the original
PNG source asserted while the preview bitmap remained deliberately delayed.
Only the test fixture changed; corrupt-image refusal was not relaxed.

## Executed signed installed-copy proof

The signed v0.1.1 app built from
`819a67da9a6d0ba1e142ee0690bdf06b1d49ba30` was replayed from an isolated
installed copy after the release lane's notarization/stapling checks. Observed
identity was `app.isPackaged: true`, version `0.1.1`, and `app.asar` SHA-256
`06d54e0ecf03ca5cdd28054edc2c27db9ded19c136952ce9a03d6778645d26a7`.
The actual bundled runtime and kernel were used; no CSS injection or source
runtime substitution was used.

The complete replay exited zero and observed:

1. The corrupt PNG is refused readably while the exact typed text and existing
   project file remain attached.
2. A valid PNG is added; actual quit/relaunch retains its exact source bytes,
   the file and unsent text, without resurrecting the refused corrupt image.
3. That restored file/image request completes in the same chat, then ordinary
   follow-up text completes; the fixture waits for idle Send, not partial output.
4. Another chat completes. Returning restores the original transcript with an
   empty draft and no cross-chat draft transfer.
5. Attachment/Send, idle Send and running Stop expose their complete circles at
   500px, 800px and 1440px; a real UI-created split retains distinct pane drafts.
   Ten captures cover 11 controls and 176 inside-circle hit points, with zero
   misses and zero renderer errors.

Only the native picker result was supplied by the fixture. All files, profiles
and model responses were synthetic/local. Actual signed screenshots were
inspected, including composer-only Stop and attachment/Send crops. Private
evidence includes `run2/result.json`, `run2/geometry.json`, `run2/identity.json`,
`corrupt-refused-draft-retained.png`, `same-chat-recovery.png` and
`real-split-send-1440.png`. The first split attempt's fixture focus failure is
retained and explained in
[the circle-clipping note](desktop-composer-control-edge-2026-11-17.md); only the
subsequent full rerun is counted as complete.

## Remaining gates

- Normal-profile installation/continuity, native updater replacement and DMG
  delivery require their separate release evidence; the signed replay above
  used an isolated installed copy, not the owner's app/profile.
- Establish the original tester build/input/failure; do not infer that the
  counterfeit PNG reproduced the original delayed reset.
- External-project and remote/container ingestion, corrupt TIFF validation,
  larger/oversized failures, unknown-send reconciliation and live-provider
  interpretation still require their own bounded evidence. The specifically
  tested attachment-triggered circle geometry is covered above, not all layouts.

Owner data, credentials, existing history and rollback copies were not changed
by this investigation or the signed isolated replay. The original tester parent
card remains open.
