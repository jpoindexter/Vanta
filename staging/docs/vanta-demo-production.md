# Vanta Demo Production Kit

## Purpose and boundary

This is the reusable capture plan for explaining Vanta to prospective users and collaborators. It turns the desktop workbench into a short, truthful product tour without claiming that a mocked screen is a live agent run.

The accompanying capture runner is [record-desktop-demo.mjs](../vanta-ts/scripts/record-desktop-demo.mjs). It produces seven 1440×960 scene images, a `manifest.json` with the exact narration, and—when `ffmpeg` is available—a caption-ready MP4.

Use a local, non-sensitive test project. Never enter real keys, customer files, customer messages, or approval requests in recorded footage.

## The first demo to record

**Title:** "Vanta: from a task to a governed result"  
**Length:** 60–90 seconds  
**Audience:** a new operator who needs to understand how Vanta works, not every implementation detail.

| Scene | Show | Say | Truth label |
| --- | --- | --- | --- |
| 1. Workspace | New task workspace | "Start from the workbench with one clear task." | Live desktop UI |
| 2. Model picker | Available session model choices | "Choose the model for this session before you run it." | Live desktop UI |
| 3. Project context | File inspector and attachments | "Attach only the project context Vanta needs." | Live desktop UI |
| 4. Outputs | Output view | "Review deliverables and reopen the session that made them." | Live desktop UI |
| 5. Connect | Connector/capability view | "Connections and capabilities are visible before they are used." | Live desktop UI |
| 6. Safety policy | Safety settings | "Actions crossing the kernel boundary follow the configured approval policy." | Live desktop UI; policy display, not proof of enforcement |
| 7. Approval | Permission overlay | "A person decides before a scoped write proceeds." | **SIMULATED SAFETY REQUEST — no action executes** |

Do not show a provider model selection as proof that a provider is authenticated, and do not show an approval overlay as proof that the underlying action engine ran. Capture those claims only after the appropriate live run is executed and its receipt is visible.

## Run the capture

The runner belongs in the full Vanta checkout, from `vanta-ts/`, because this review snapshot has no dependency tree or Electron entry point.

```bash
cd /path/to/full/vanta-ts
node scripts/record-desktop-demo.mjs
```

Useful controls:

```bash
# Put assets in a known review folder.
VANTA_DEMO_OUTPUT=/tmp/vanta-demo node scripts/record-desktop-demo.mjs

# Capture images only; do not require ffmpeg.
VANTA_DEMO_VIDEO=0 node scripts/record-desktop-demo.mjs

# Use a packaged local desktop application when recording a release candidate.
VANTA_DESKTOP_APP=/absolute/path/to/Vanta.app/Contents/MacOS/Vanta node scripts/record-desktop-demo.mjs
```

It deliberately does not send a chat request, change a model, save messaging settings, or answer the approval. The approval scene is intercepted locally and carries a fixture marker in its content. That keeps the capture reproducible and prevents a demo run from spending money or changing state.

The default output is `artifacts/demo-capture/<timestamp>/` and contains:

- `01`–`07` PNG scene images;
- `manifest.json` with narration and the list of fixture scenes;
- `vanta-desktop-tour.mp4` when `ffmpeg` is installed.

The MP4 is a timed image-sequence walkthrough, not a mouse-motion recording. Use it as the visual base track; add a voiceover and the lower-third labels below in the editor. If a fully animated capture is needed, record the same steps in Screen Studio, QuickTime, or OBS and use the PNG sequence as the shot list and visual reference.

## Recording rules

Every final cut must include these labels:

- Scene 7: `SIMULATED SAFETY REQUEST — NO ACTION EXECUTES`.
- Any mocked response: `DEMO FIXTURE`.
- Any real local run: identify the provider and model in the narration only if they are actually visible and authenticated for that capture.

Keep the narration grounded in observable behavior. Preferred: "Vanta presents an approval request before this scoped write." Avoid: "Vanta safely executes all actions." The latter requires a live end-to-end policy test, not a screen capture.

## Before publishing

- [ ] Use a dedicated throwaway project with no personal or customer data.
- [ ] Verify the status, model, and project name shown on screen are appropriate for public viewing.
- [ ] Confirm all seven PNGs exist and `manifest.json` lists exactly one fixture scene.
- [ ] Watch the MP4 and make sure no secrets, paths, account names, notifications, or unrelated windows appear.
- [ ] Add the fixture lower-third to scene 7 before export.
- [ ] For claims about a real run, capture the action, approval decision, resulting output, and session receipt in one continuous take.

## What this setup proves—and what it does not

| Claim | Evidence from this kit | Status |
| --- | --- | --- |
| The desktop screens can be captured repeatably | Recorder script and scene manifest | Code path prepared; requires full checkout to execute |
| The demo does not invoke a model or approve a write | Script only navigates UI and intercepts `/api/approval` | Code path prepared |
| A video is created | `ffmpeg` conversion after image capture | Requires `ffmpeg` and a runnable full checkout |
| Vanta executes governed agent actions end to end | Not exercised by this kit | Not established |

The wider acceptance criteria and live test gaps remain in [vanta-first-run-test-matrix.md](vanta-first-run-test-matrix.md).
