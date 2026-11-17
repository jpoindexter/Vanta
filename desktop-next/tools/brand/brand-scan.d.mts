export const ROOT: string
export const ALLOWED: RegExp[]
export function scan(root?: string): Record<string, Array<{ line: number; name: string; text: string }>>
