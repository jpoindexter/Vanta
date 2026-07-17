# Desktop Connect setup status

Date: 2026-07-17

Roadmap card: `DESKTOP-CONNECT-SETUP-STATUS`

## Outcome

Desktop Connect now reports configuration as user outcomes instead of counts and raw settings:

- **Ready** — the active provider resolves, or a messaging adapter has every required local setting;
- **Needs setup** — an available provider or adapter is missing required configuration;
- **Unavailable** — the provider catalog or adapter is not present in the current build.

The active model exposes a non-inference **Test model** action that verifies provider/model resolution. A configured messaging adapter exposes **Test setup**, which rechecks implementation and required local settings without sending a message or exposing credentials. Adapter responses contain readiness and missing-field names only; saved secret values are never returned.

Global startup recovery now distinguishes provider failures from project file/catalog and service failures. Only provider failures offer **Configure model**. Project failures explain the local path, permission, or catalog recovery and offer Retry without redirecting the operator into unrelated credential setup.

## Executed proof

```bash
npm run typecheck
npm run desktop:renderer:typecheck
npx vitest run src/desktop/operator-data.test.ts src/desktop/operator-api.test.ts desktop-app/src/operator-views.test.tsx desktop-app/src/connection-recovery.test.ts --maxWorkers=1
npm run desktop:operator-flows:smoke
npm run desktop:layout:smoke
VANTA_DESKTOP_APP="$PWD/release/mac-arm64/Vanta.app/Contents/MacOS/Vanta" node scripts/desktop-operator-flows-smoke.mjs
node scripts/desktop-flow-proof-suite.mjs
```

The source and signed packaged Connect flows both produced `modelTest: true` and `messagingTest: true`. The layout smoke proved service and project failures hide provider setup while a provider failure exposes it. The final complete desktop matrix passed source and packaged targets.

## Boundary

The test actions validate local readiness without spending model tokens or contacting a messaging recipient. A live provider inference and end-to-end channel delivery remain separate credentialed acceptance gates.
