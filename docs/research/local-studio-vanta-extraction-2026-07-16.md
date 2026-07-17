# Local Studio to Vanta Extraction

Date: 2026-07-16

Reference: [`sybil-solutions/local-studio`](https://github.com/sybil-solutions/local-studio) at `07be5be7ce69bea0c3118744ab90d148b010fce0` (Apache-2.0).

## Decision

Local Studio does not replace Vanta's desktop shell. Vanta remains a chat-first operator workbench with Ghost black/white styling, Codex-like transcript hierarchy, Keelhouse pane mechanics, and Vanta-owned approvals, receipts, memory, goals, and remote execution.

The useful extraction is an **operator runtime layer** inside that shell:

- switch between local and remote controllers without leaving the active task;
- see controller, model, engine, resource, and queue state in one compact strip;
- launch, stop, benchmark, and diagnose a local model through explicit actions;
- supervise long sessions with prompt markers, persisted reading position, and queued turns;
- configure reusable runtime profiles with a resource-fit estimate and command preview;
- install/download models through a durable queue with pause, retry, and storage receipts;
- use one guided setup path from hardware detection through a verified first inference;
- attribute model/runtime usage separately from provider token cost.

## Source Evidence

| Local Studio source | Observed pattern | Vanta interpretation |
| --- | --- | --- |
| `frontend/src/features/dashboard/control-panel/controller-matrix-store.ts` and `control-panel.tsx` | Multiple controller endpoints with online, idle, running, offline, and auth states | Compact controller switcher bound to Vanta hosts/nodes and kernel readiness |
| `frontend/src/features/dashboard/use-model-lifecycle.ts` | Model launch and stop lifecycle | Explicit local runtime actions with confirmation, progress, failure class, and receipt |
| `frontend/src/features/dashboard/control-panel/gpu-section.tsx` | GPU and runtime telemetry | Resource-fit strip for GPU, unified memory, VRAM, context, and estimated headroom |
| `frontend/src/features/setup/setup-view/*` | Hardware -> model -> download -> launch -> benchmark setup | One cold-start local-model wizard that ends in a real Vanta task |
| `frontend/src/features/recipes/recipe-modal/*` | Backend, model, resources, performance, environment, and command configuration | Searchable runtime profiles with safe defaults, command preview, and Vanta policy scope |
| `frontend/src/features/recipes/recipes-content/downloads-tab.tsx` | Durable model downloads | Download queue with storage target, progress, pause, retry, checksum, and cleanup |
| `frontend/src/features/agent/ui/pane-grid.tsx` and workspace pane controller | Split panes with persisted ownership | Complete Vanta's shared pane contract; do not create another shell |
| `frontend/src/features/agent/ui/projects-nav-section.tsx` | Project sessions, pinning, ordering, active sessions, persistent terminals | Add explicit pin/reorder and keep terminal ownership attached to its task |
| `frontend/src/features/agent/ui/timeline/timeline.tsx` | Prompt minimap, persisted scroll, new-message return | Long-session navigation that preserves the operator's reading position during streaming |
| `frontend/src/features/agent/ui/agent-queue-panel.tsx` | Queued instructions | Visible steer/next queue with reorder, edit, cancel, and execution state |
| `frontend/src/features/usage/usage-page.tsx` | Usage telemetry | Runtime minutes, throughput, cache, energy/resource pressure, and provider cost in one receipt model |
| `frontend/src/features/logs/*` | Controller and server logs | Contextual runtime diagnosis opened from the failing controller/model, not a global log wall |

## Product Fit

### Adopt now

1. **Controller and runtime strip**: host, kernel, engine, active model, state, memory pressure, and queue depth stay visible without becoming a dashboard.
2. **Runtime detail tray**: one contextual pane owns launch/stop/benchmark, resource fit, logs, and the current command.
3. **Long-session navigation**: prompt markers, reading-position persistence, and a clear `Latest` return control.
4. **Queued turns**: queued instructions remain visible beside the current run and can be edited or reordered before execution.
5. **Local model setup proof**: detect hardware, choose a compatible profile, download, launch, benchmark, and run one real prompt.

### Adopt after the core slice

1. Runtime profiles with backend-specific advanced fields and command preview.
2. Durable model download queue and storage management.
3. Runtime usage/resource ledger joined to Vanta's existing provider cost ledger.
4. Project session pin/reorder and terminal ownership refinements where current behavior is incomplete.

### Reject

- A second dashboard competing with Work as the home surface.
- Copying Local Studio branding, palette, or implementation-specific Next.js shell.
- Showing every GPU/log/config value all the time.
- Automatically launching or evicting models without the active Vanta approval contract.
- Treating a reachable controller as trusted; Vanta still requires kernel readiness and explicit host policy.
- Duplicating Vanta's existing model picker, MCP control center, Connect setup, Files, Diff, Preview, Terminal, or receipt surfaces.

## Demo Contract

The standalone concept at `docs/design-refs/vanta-local-studio-operator.html` demonstrates:

- the accepted Vanta Ghost shell and Codex-style conversation;
- local/remote controller switching with health states;
- a contextual Runtime tray with model lifecycle, resource fit, logs, and benchmark action;
- prompt markers and persisted transcript position affordances;
- a queued-turn drawer with edit, reorder, and cancel controls;
- a guided local-model setup overlay;
- runtime profiles and downloads as progressive detail, not a new destination;
- responsive collapse from three panes to one work surface plus drawers.

The demo uses illustrative data. It does not prove controller connectivity, model execution, download integrity, Electron persistence, or packaged-app behavior.

## Executed Demo Proof

- `NODE_PATH=<bundled-runtime>/node_modules node scripts/vanta-local-studio-demo-smoke.mjs` passes with system Chrome.
- The smoke exercises controller switching, queue open/close, profile selection, setup progression, theme switching, and compact sidebar/inspector drawers.
- Layout and transcript/composer visibility pass at `1440x960`, `1024x700`, `760x700`, and `390x844`; page errors and viewport overflow fail the run.
- The responsive proof caught and fixed a missing compact inspector entry point and a zero-width phone Work column before the roadmap update was accepted.

Visual receipts:

- [Desktop 1440](./local-studio-vanta-extraction-2026-07-16/screenshots/desktop-1440.png)
- [Compact 1024](./local-studio-vanta-extraction-2026-07-16/screenshots/compact-1024.png)
- [Compact 760](./local-studio-vanta-extraction-2026-07-16/screenshots/compact-760.png)
- [Phone 390](./local-studio-vanta-extraction-2026-07-16/screenshots/phone-390.png)

## Delivery Order

1. **Shipped 2026-07-17:** add the controller/runtime status contract to the Vanta desktop adapter foundation. See `local-runtime-controller-contract-2026-07-17.md`.
2. **Shipped 2026-07-17:** own the kernel-gated local inference process lifecycle and prove one direct llama.cpp model end to end. See `local-runtime-engine-lifecycle-2026-07-17.md`.
3. **Shipped 2026-07-17:** render the compact runtime strip in the existing shell. See `desktop-runtime-controller-strip-2026-07-17.md`.
4. **Shipped 2026-07-17:** turn Runtime into an operational detail tray with lifecycle actions, resource fit, command evidence, and bounded logs. See `desktop-runtime-detail-tray-2026-07-17.md`.
5. **Shipped 2026-07-17:** build the hardware-to-first-inference setup flow against one supported local backend. See `local-model-first-inference-wizard-2026-07-17.md`.
6. **Shipped 2026-07-17:** add prompt markers, reading-position persistence, and measured transcript virtualization to Work. See `desktop-long-session-navigation-2026-07-17.md`.
7. **Shipped 2026-07-17:** add the durable queued-turn editor with edit, reorder, steer, cancel, race, and restart recovery. See `desktop-queued-turn-editor-2026-07-17.md`.
8. **Shipped 2026-07-17:** add versioned runtime profiles with host/resource validation, safe advanced controls, secret references, and command round-trip proof. See `local-runtime-profiles-2026-07-17.md`.
9. Add the durable model download queue and storage controls.
10. Join runtime telemetry to the existing usage ledger and release proof suite.
