# Desktop runtime detail tray

**Roadmap:** `DESKTOP-RUNTIME-DETAIL-TRAY`  
**Implemented:** 2026-07-17

## Outcome

The desktop Runtime disclosure is now an operational detail tray rather than a status-only panel. It keeps the active transcript and composer in place while exposing the controller identity, request owner, engine and model, live pressure, resource fit, redacted launch command, approval state, benchmark result, bounded lifecycle history, and the actions available for the selected host.

Local lifecycle actions use Vanta's managed runtime lifecycle and kernel boundary. Launch, stop, and retry act on the persisted runtime specification; reconnect reconciles persisted process state. Remote controllers expose reconnect only. A successful stop immediately offers **Undo stop**, which relaunches the same verified specification. Errors remain in the tray with the transcript draft untouched.

## Boundary and receipts

The loopback `/api/runtime` route accepts a typed host selection or lifecycle action and returns one refreshed runtime payload. The desktop API redacts the absolute model path to its basename while preserving the command hash, limits lifecycle history to the latest 12 receipts, and does not return credential references, bearer tokens, prompts, or model responses.

The tray separates:

- controller transport from kernel readiness;
- estimated fit from live memory pressure;
- lifecycle state from approval state;
- benchmark latency from provider-turn latency;
- local lifecycle ownership from remote reconnect capability.

## Executed proof

Executed:

```bash
npx vitest run desktop-app/src src/desktop --maxWorkers=1
npx tsc --noEmit
npx tsc -p desktop-app/tsconfig.json --noEmit
npm run vanta -- lint src/desktop/runtime-controller.ts desktop-app/src/runtime-strip.tsx desktop-app/src/types.ts
npm run desktop:runtime-strip:smoke
```

Observed:

- 29 desktop test files and 98 tests passed;
- core and renderer TypeScript checks passed;
- the new bounded runtime files passed Vanta's file, function, parameter, and complexity limits;
- production renderer build completed;
- Electron exercised launch, stop, failed stop, Undo stop, remote reconnect, and in-place updates;
- a typed composer draft survived every runtime action;
- Escape closed the tray and restored focus to its trigger;
- role queries proved the labelled non-modal dialog and host pressed state;
- dark and light themes passed at 1440 px;
- the 760 px tray stayed inside a 760 x 900 viewport, with no horizontal overflow and no overlap with compact navigation.

This proof uses deterministic local and remote controller fixtures inside the actual Electron renderer. It establishes the desktop interaction and backend lifecycle wiring, but it does not claim a live remote controller deployment or a physical screen-reader session.
