# Chat recovery after failed image send — reported regression

Canonical ID: `DESKTOP-CHAT-IMAGE-FAILURE-RECOVERY`.
Trello mirror: [Recover chat after failed image send](https://trello.com/c/nm0VTKua).
Owner: Jason. Priority: high for triage. Status: reported, not reproduced or fixed.

## Evidence and uncertainty

The owner supplied a one-page PDF titled *Chat no longer working  Vanta.pdf*,
containing a tester's message dated 17 November 2026 at 10:08 AM. The tester
reports that an image could not be sent, the affected chat then stopped working,
and refresh did not restore it. Only one chat is reported affected.

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
- Unknown send results reconcile before retry; no duplicated messages, model
  runs or external effects occur.
- Another chat remains usable. Retain actual packaged-build evidence.

## Planning boundary

Captured as a narrow defect at the top of the existing defects/hardening list.
It does not add a third Building lane, consume another Next slot or certify a
parent Desktop card. Triage may promote this over lower-impact work after a
reproducible case is established. No implementation or runtime check was
performed for this card-capture request.
