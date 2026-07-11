# Media studio

Vanta's local media studio turns a bounded JSON brief into a verified MP4. It
uses project-scoped color or image scenes and the local `ffmpeg`/`ffprobe`
binaries. This first provider costs `$0.00`; no external generation or publish
operation is performed.

```bash
vanta media-studio preview briefs/launch.json
vanta media-studio render briefs/launch.json --yes
vanta media-studio board briefs/launch.json
vanta media-studio stages
```

```json
{
  "title": "Launch clip",
  "output": "artifacts/launch.mp4",
  "width": 1280,
  "height": 720,
  "fps": 24,
  "scenes": [
    { "title": "Opening", "duration": 1.5, "background": "#224466" },
    { "title": "Result", "duration": 2, "image": "assets/result.png" }
  ]
}
```

Every scene needs exactly one six-digit background color or project-relative
image. Briefs allow 1-24 scenes, at most 30 seconds each, 320x180 through 4K,
and 12-60 fps. Output must be a project-relative `.mp4` path.

`preview` prints scenes, providers, duration, dimensions, fps, and estimated
cost. The agent-facing `media_studio` tool attaches that preview to the approval
ask; the CLI requires `--yes`. Rendering creates isolated scene files, joins
them into H.264 MP4, and removes temporary render data.

Verification uses `ffprobe` plus an FFmpeg `signalstats` frame pass. The receipt
under `.vanta/media/receipts` records prompts/titles, provider, `$0` cost, source
assets, duration/dimension/stream/byte/nonblank checks, and final status without
secrets. `board` creates a durable Kanban template whose lanes require
`media-script`, `media-visual`, `media-audio`, `media-render`, and
`media-review` profile skills and preserve production dependencies.

External image/video providers and publishing are intentionally absent from
this slice. Future adapters must add explicit cost preview and approval before
network generation or irreversible publication; they must retain the same
scoped-asset and receipt checks.
