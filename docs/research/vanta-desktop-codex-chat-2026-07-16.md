# Vanta Desktop Codex-style chat surface

Date: 2026-07-16

## Product decision

Vanta adopts Codex Desktop's conversation hierarchy without copying its brand:

- centered transcript and composer on one 760px reading axis;
- unboxed assistant output with actions after the response;
- compact right-aligned operator bubbles with timestamp and copy action;
- safe rendered Markdown for headings, lists, code, and links;
- tool activity grouped as quiet receipts rather than a decorative timeline;
- a wide two-row composer with project/host context, model, approval mode, attachments, commands, and send controls;
- the existing contextual inspector, Ghost black/white palette, and kernel approval boundary remain Vanta-specific.

## Rejected

- Pixel-copying Codex colors or branding.
- Hiding Vanta's execution context to make the composer visually empty.
- Adding another shell or replacing the Vanta runtime/API boundary.
- Rendering model-authored HTML directly or allowing unsafe link protocols.

## Executed proof

- `npm test -- --run desktop-app/src/chat.test.tsx desktop-app/src/message-markdown.test.tsx`: 6 tests passed.
- `npm run desktop:renderer:typecheck`: passed.
- `npm run desktop:shell-convergence:smoke`: passed at 1440x960, 1024x700, 760x700, and 390x844.
- The Electron geometry proof measured the transcript and composer at 760px with identical left/right edges; assistant background was transparent; operator background was tonal; redundant assistant speaker labels were zero.
- `npm run desktop:native:smoke`: renderer assets and packaged kernel reached ready state.

## Visual receipts

- [Desktop](./vanta-desktop-codex-chat-2026-07-16/screenshots/desktop.png)
- [Compact 760px](./vanta-desktop-codex-chat-2026-07-16/screenshots/compact-760.png)
