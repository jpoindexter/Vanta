# Vanta Operator SDK

Typed TypeScript client for Vanta's authenticated public API v1. Node.js 20+ is supported.

```ts
import { VantaClient } from "@jpoindexter/vanta-operator-sdk";

const vanta = new VantaClient({
  baseUrl: "http://127.0.0.1:7791",
  token: process.env.VANTA_API_TOKEN!,
});

await vanta.startSession();
const turn = await vanta.streamInput("Summarize this repository", (event) => {
  if (event.type === "output.delta") process.stdout.write(event.delta);
});
console.log(turn);
```

Create a bearer token with `vanta api token create <name>`, then run the loopback server with `vanta api serve`. See `docs/public-api-v1.md` in the Vanta repository for the endpoint and approval contract.
