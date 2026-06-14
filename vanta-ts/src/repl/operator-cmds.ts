// Barrel for the operator store-view slash handlers (capability health + the
// durable stores: world model, money OS, opportunity radar, worker roster).
// Keeps handlers.ts import list lean (under the file-size gate).

export { health } from "./health-cmd.js";
export { world } from "./world-cmd.js";
export { money } from "./money-cmd.js";
export { radar } from "./radar-cmd.js";
export { team } from "./team-cmd.js";
export { lifesearch } from "./lifesearch-cmd.js";
export { compartments } from "./compartments-cmd.js";
export { locks } from "./verify-cmd.js";
