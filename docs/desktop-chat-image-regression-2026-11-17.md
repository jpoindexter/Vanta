# Chat recovery after failed image send — reported regression

Canonical ID: `DESKTOP-CHAT-IMAGE-FAILURE-RECOVERY`.
Trello mirror: [Recover chat after failed image send](https://trello.com/c/nm0VTKua).
Owner: Jason. Priority: high for triage. Status: reported, not reproduced or fixed.

## Evidence and uncertainty

The owner supplied a one-page PDF titled *Chat no longer working  Vanta.pdf*,
containing a tester's message dated 17 November 2026 at 10:08 AM. The tester
reports that an image could not be sent, the affected chat then stopped working,
and refresh did not restore it. Only one chat is reported affected.

Owner clarification later on 17 November: this occurs when trying to add an
attachment (ordinary file, photo, etc.), followed by a slow chat reset. Broaden
reproduction beyond image-only sends. The composer-edge screenshot is related
trigger evidence; the separately measured narrow-pane shadow-gutter change
does not establish a fix for attachment admission, rendering or recovery.

This establishes the reported symptom and sequence, not causation. The exact
build, image format/size, provider/network response, session identity, refresh
operation, persistence state and extent of any data loss are unknown. The
private PDF, email, contact information and conversation contents are not copied
into the repository or uploaded to public GitHub.

## Narrow next action

Preserve the affected session and obtain minimal consented/redacted failure
evidence. Identify the exact build and reproduce with an isolated profile and a
synthetic or consented equivalent image. Fix one demonstrated cause at a time;
do not reset owner data or automatically resend an uncertain message/action.

## Proof of Done

- The reproduced image-send failure no longer strands the affected chat.
- A subsequent text message works in that same conversation.
- Refresh/reopen and cold restart preserve its transcript, unsent draft and
  recoverable attachments.
- A supported image succeeds; unsupported, oversized and corrupt images show a
  specific recoverable explanation without breaking the conversation.
- Adding an ordinary file or photo does not trigger a clipped composer,
  renderer failure, unexpected navigation or delayed reset. Record add-versus-
  send timing separately and preserve the originating conversation and draft.
- Unknown send results reconcile before retry; no duplicated messages, model
  runs or external effects occur.
- Another chat remains usable. Retain actual packaged-build evidence.

## Isolated baseline probe — 17 November

The signed local 0.1.0-test.20261117.1 candidate was launched with a separate
synthetic profile, project and provider. The actual file and image menu/picker
paths admitted a Markdown file and a PNG. Saving notices cleared within the
1.5-second observation window; there were no captured renderer errors or route
changes. The native picker result alone was supplied by the fixture.

This did not reproduce the reported delayed reset. It does not establish that
the affected owner's conversation, larger/corrupt files, send failures or cold
restart work. Shared attachment-restoration/send gating is under investigation;
do not call the generic shadow-gutter edit an attachment-recovery fix. The local
candidate is held from release pending a supported incident diagnosis.

## Planning boundary

The normal [Desktop v0.1.0 release](releases/desktop-v0.1.0.md) now contains the
bounded native file-reference repair. Its final extracted ZIP passed project
Markdown plus PNG admission/submission in one chat, with exact PNG bytes and
the reference reaching one local model request, relative file metadata retained
and zero captured renderer errors. It is signed/notarized. This does not
reproduce the tester's exact failure, external files, corrupt/oversized inputs,
failure recovery or every attachment-triggered geometry; this card stays open.

Later release preparation reproduced a missing native file-staging method in
the actual signed package. Its bounded local-reference repair and refusal limits
are recorded in [native file references](desktop-native-file-reference-2026-11-17.md).
Do not equate this source repair with the original tester's exact incident or
with unrestricted external-file upload support.

Captured as a narrow defect at the top of the existing defects/hardening list.
It does not add a third Building lane, consume another Next slot or certify a
parent Desktop card. Triage may promote this over lower-impact work after a
reproducible case is established. Initial capture was planning-only; the later
isolated probe above does not clear the card.
