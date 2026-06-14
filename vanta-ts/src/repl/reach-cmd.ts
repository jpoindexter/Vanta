import { checkAll } from "../reach/registry.js";
import { formatDoctor } from "../reach/doctor.js";
import type { SlashHandler } from "./types.js";

// `/reach` — the reach doctor: each internet-reach channel's active backend,
// status (ok/warn/off), and the exact fix on a gap. A window onto the reach
// capability layer (reach/registry.ts).
export const reach: SlashHandler = async (_arg, ctx) => ({
  output: formatDoctor(await checkAll(ctx.env)),
});
