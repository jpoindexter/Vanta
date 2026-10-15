# Verification Script Guidelines

- Drive the real shipped surface when practical; do not replace end-to-end behavior with source-string assertions.
- Use isolated temporary projects, profiles, and ports. Clean them in `finally` blocks.
- Mock paid provider output only when the test names that boundary, while keeping Electron, renderer, preload, IPC, and API behavior real.
- Emit compact JSON evidence and fail with actionable assertions.
- Keep automation deterministic and avoid mutating the operator's live Vanta state.
