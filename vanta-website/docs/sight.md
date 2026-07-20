---
id: sight
title: Sight & screen context
sidebar_position: 9
---

# Sight & screen context

Sight lets Vanta inspect exactly what you choose on your Mac. It is an explicit capture, not continuous screen recording: select an area, one window, or all displays, then ask a question about the attached image.

## Use it in the CLI or TUI

| Command | Captures |
|---|---|
| `/look` or `/look marquee` | An area you drag to select |
| `/look window` | One window you click |
| `/look screen` | Every connected display |

After the capture, Vanta shows an attachment receipt. Type the question you want answered and send the turn. The image is not submitted by the capture command itself.

```text
/look
What is causing the error in this dialog?
```

Use `/attachments` to inspect pending context or `/attachments clear` to remove it before sending. You can also ask Vanta to “look at this screen”; the agent can invoke the kernel-gated `look_at_screen` tool when the request is unambiguous.

## Use it in Desktop

Select the capture control beside the composer, then choose:

- **Select area** — drag a rectangle around the relevant UI.
- **Select window** — click the app window Vanta should inspect.
- **All displays** — capture every connected screen.

The result appears as a removable image attachment. Add a question, then send. You can also paste multiline text or clipboard PNG, TIFF, and JPEG images directly into the composer with `Cmd+V`.

## Privacy and boundaries

- Capture starts only after an explicit command or capture action.
- Vanta does not enable ambient or continuous recording by default.
- The native screenshot file is deleted immediately after Vanta ingests it.
- Unsent capture context expires after five minutes.
- Receipts identify the capture source, time, scope, dimensions, and expiry.
- The selected image follows the same routed vision-model and kernel boundary as other image context.

If the main model cannot accept images, configure a vision-capable route with `VANTA_VISION_MODEL` and, when needed, `VANTA_VISION_PROVIDER`.

## macOS permission

The CLI host or Vanta Desktop needs **Screen Recording** permission:

1. Open **System Settings → Privacy & Security → Screen Recording**.
2. Enable the terminal application you use for the CLI, or enable **Vanta** for Desktop.
3. Quit and relaunch that application.
4. Retry the capture.

Vanta detects blank permission-denied captures and opens the correct settings pane instead of attaching an unusable image. Cancelling the area or window selector attaches and sends nothing. If a capture is too large, select a smaller area and retry.

## Current proof boundary

The real CLI/TUI path has captured a Retina display and completed a visual question through Vanta. Focused tests cover area, window, all-display, cancellation, permission denial, multiple displays, Retina dimensions, oversized images, and expiry. Source and signed-package Desktop smokes pass. The remaining release proof is one successful visual question from the signed Desktop app after Screen Recording permission is granted to that app.
