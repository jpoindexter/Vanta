// Braille spinner frame sets — hand-rolled (no dep; these are just string
// arrays). Each is a cycle of single-cell braille glyphs animated by the status
// bar. Pick the active one with VANTA_SPINNER (defaults to "orbit").

export const SPINNERS = {
  // Classic 8-frame dot orbit.
  orbit: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  // Two dots chasing each other around the cell.
  dots: ["⠈⠁", "⠈⠑", "⠈⠱", "⠈⡱", "⢀⡱", "⢄⡱", "⢄⡱", "⢆⡱", "⢎⡱", "⢎⡰", "⢎⠰", "⠎⠰", "⠊⠰", "⠊⠠", "⠊⠁", "⠉⠁"],
  // Fill up, then drain — a breathing column.
  pulse: ["⠀", "⠄", "⠆", "⠇", "⡇", "⡏", "⡟", "⡿", "⣿", "⡿", "⡟", "⡏", "⡇", "⠇", "⠆", "⠄"],
  // A single dot snaking around the perimeter of the cell.
  snake: ["⠁", "⠉", "⠊", "⠒", "⠢", "⠆", "⡄", "⡠", "⡀", "⢀", "⠠", "⠐", "⠈"],
  // A wave sweeping left to right.
  wave: ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"],
} as const;

export type SpinnerName = keyof typeof SPINNERS;

const DEFAULT: SpinnerName = "orbit";

/** Frames for the configured spinner, honouring VANTA_SPINNER, with a fallback. */
export function spinnerFrames(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  const name = env.VANTA_SPINNER as SpinnerName | undefined;
  return (name && SPINNERS[name]) || SPINNERS[DEFAULT];
}
