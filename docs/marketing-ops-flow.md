# Marketing Ops Connector Flow

Use Vanta to inspect campaign/event data without baking marketing APIs into the core loop.

1. Configure credentials outside the repo:
   - `AMPLITUDE_API_KEY`
   - `CUSTOMERIO_APP_API_KEY`
2. Read data through the connector:
   - `vanta marketing read amplitude`
   - `vanta marketing read customerio`
3. In an agent run, use the kernel-gated `marketing_read` tool for the same providers.
4. Pair with `vanta auto-watch` to monitor a metric export and draft a response when it changes.

Fixture mode is available for review and tests:

```bash
vanta marketing read amplitude --fixture amplitude-events.json
vanta marketing read customerio --fixture customerio-campaigns.json
```

The first shipped connectors are read-only: Amplitude events and Customer.io campaigns.
