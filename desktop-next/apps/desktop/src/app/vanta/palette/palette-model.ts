import type { PaletteCommand } from '../types'

/** Case-insensitive substring match on the label, keeping the host's order. */
export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const needle = query.trim().toLowerCase()

  return needle ? commands.filter(command => command.label.toLowerCase().includes(needle)) : commands
}

/** Arrow-key movement that wraps; 0 when the list is empty. */
export function moveActive(current: number, delta: -1 | 1, length: number): number {
  return length === 0 ? 0 : (current + delta + length) % length
}
