# CLAUDE.md — vanta-ts/src/settings

Settings layer for non-secret Vanta configuration.

- `store.ts`: Zod schema, three-scope merge, path helpers, env application, and display formatting.
- `store.test.ts`: schema acceptance, merge precedence, env application, and formatter coverage.
- `autoMode` config is consumed by `permissions/auto-mode.ts`; settings should not implement permission logic itself.

Keep the schema explicit. Unknown keys intentionally disappear so bad config cannot silently affect runtime behavior.
