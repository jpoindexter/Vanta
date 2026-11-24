import { fetchGlobals } from "./maintained-fetch.mjs";

// Only owned Node entry points initialize globals, before consumers capture them.
// Keep WebSocket, EventSource and their event constructors unchanged.
Object.assign(globalThis, fetchGlobals);
