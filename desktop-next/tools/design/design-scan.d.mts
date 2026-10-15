export const SRC: string
export const CATEGORIES: Record<string, unknown>
export function scan(root?: string): Record<string, Record<string, number>>
export function total(perFile: Record<string, number>): number
