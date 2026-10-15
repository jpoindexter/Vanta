# True First-Token Performance Harness

Vanta’s TTFT harness measures the production path from process launch through the first visible model output. It covers readline CLI, Ink TUI, the authenticated streaming API gateway, and the signed packaged Desktop app.

Each surface runs five isolated samples in both fresh-profile and warm-profile modes. The receipt records content-free timestamps for:

- process start to interactive readiness
- submission to provider dispatch
- provider dispatch to first streamed delta
- first delta to first surface paint
- submission to first surface paint

Results include median, p95, worst sample, machine/build metadata, provider/model identity, and a local model digest when available. Desktop samples must use a packaged Developer ID-signed app. The renderer’s paint timestamp follows a matching assistant DOM mutation and `requestAnimationFrame`; gateway output is observed at the authenticated SSE consumer.

## Commands

Run the current regression budgets:

```bash
cd vanta-ts
VANTA_TTFT_LIVE=1 npm run ttft:proof
```

Record a reviewed baseline and regenerate budgets:

```bash
VANTA_TTFT_LIVE=1 npm run ttft:update
```

The default live provider is local Ollama `qwen2.5:14b`. Override it with `VANTA_TTFT_PROVIDER` and `VANTA_TTFT_MODEL`. An unverified provider remains ineligible for a baseline.

Baseline receipts live at `vanta-ts/scripts/fixtures/ttft-baseline-<platform>-<arch>.json`; budgets live at `vanta-ts/scripts/fixtures/ttft-performance-budgets.json`.

The harness refuses mocked providers, fewer than five samples, missing surface/profile groups, and unsigned or unpackaged Desktop runs. A regression failure names the surface, profile mode, stage, measured p95, baseline, allowed regression, and hard ceiling.
