# Vanta Desktop native shell

Launch from source:

```bash
npm run desktop:native
```

Build the renderer and run the native layout contract:

```bash
npm run desktop:renderer:typecheck
npm run desktop:layout:smoke
```

## Shell contract

Vanta Desktop uses the Keelhouse agent-task flow inside Vanta's own runtime boundary:

- app-level titlebar for task identity, kernel status, and shell controls
- project-first task rail with session search and lifecycle actions
- one central conversation and run surface
- composer-owned file context and per-session model choice
- contextual outputs/files/Canvas/preview/terminal inspector, closed at startup
- bounded resizable panes on desktop and overlay drawers at compact widths

The renderer does not import Keelhouse code or branding. It ports the shell hierarchy and flow while retaining Vanta's kernel approvals, provider routing, receipts, artifacts, Canvas, and local session store.

## Model flow

The model picker uses a generated static catalog as an offline floor and can refresh a selected provider from server-side discovery. Provider credentials remain in the desktop server process and are never sent to the renderer. The picker distinguishes the current session model from the saved provider default and permits a typed model ID for newly released models that have not reached the static catalog yet.

## Native lifecycle

The Electron main process launches `node --import tsx src/cli.ts desktop <port> --no-open`, waits for the local server, opens a native `BrowserWindow`, and terminates the child server on app quit. Use `--devtools` when debugging the renderer.

The packaged-app release criterion is stricter than a renderer build: the signed application must launch, complete the operator-flow smoke, pass the layout smoke at desktop and compact sizes, and satisfy the notarization/Gatekeeper checks documented by the release workflow.
