import { classifyPath, compartmentMap } from "../self/compartments.js";
import type { CompartmentInfo } from "../self/compartments.js";
import type { SlashHandler } from "./types.js";

const NO_SELF_EDIT_NOTE = "(brainstem + skeleton are never self-edited — kernel-enforced)";

/** Pure: render the full compartment map as a titled list. */
export function formatCompartments(map: ReturnType<typeof compartmentMap>): string {
  const rows = map.map(
    (c) => `  ${c.compartment.padEnd(12)} · ${c.maxAutonomy.padEnd(6)} · ${c.scope}`,
  );
  return [`Compartment map — ${map.length} compartments`, ...rows, "", NO_SELF_EDIT_NOTE].join("\n");
}

function describe(info: CompartmentInfo, path: string): string {
  return [
    `${path}`,
    `  compartment : ${info.compartment}`,
    `  maxAutonomy : ${info.maxAutonomy}`,
    `  why         : ${info.why}`,
  ].join("\n");
}

export const compartments: SlashHandler = async (arg) => {
  const trimmed = arg.trim();
  if (trimmed) {
    return { output: describe(classifyPath(trimmed), trimmed) };
  }
  return { output: formatCompartments(compartmentMap()) };
};
