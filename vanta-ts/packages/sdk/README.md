# Vanta Operator SDK

Typed TypeScript client for Vanta's authenticated public API v1. Node.js 20+ is supported.

```ts
import { VantaClient } from "@jpoindexter/vanta-operator-sdk";

const vanta = new VantaClient({
  baseUrl: "http://127.0.0.1:7791",
  token: process.env.VANTA_API_TOKEN!,
});

const live = await vanta.live();             // cheap, non-mutating liveness
const readiness = await vanta.readiness();   // authenticated status + counts
await vanta.startSession();
const turn = await vanta.streamInput("Summarize this repository", (event) => {
  if (event.type === "output.delta") process.stdout.write(event.delta);
});
console.log(turn);
```

Spreadsheet add-ins can use the bounded context wrapper. Cell values are
marked as untrusted data before they enter the Vanta session.

```ts
import { SpreadsheetVantaClient } from "@jpoindexter/vanta-operator-sdk";

const client = new SpreadsheetVantaClient({
  baseUrl: "https://localhost:7791",
  token: process.env.VANTA_API_TOKEN!,
});

const answer = await client.ask("Explain this range", {
  workbook: "Budget.xlsx",
  sheet: "Summary",
  range: "B2:F8",
  values: [["Revenue", 100, 110, 120]],
});
```

Create a bearer token with `vanta api token create <name>`, then run the loopback server with `vanta api serve`. See the [HTTP API reference](https://docs.vanta.theft.studio/reference/api/) for the endpoint and approval contract.
