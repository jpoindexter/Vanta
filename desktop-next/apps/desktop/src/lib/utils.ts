import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The radius roles (styles.css) are rounded-* classes like any other: a later `rounded-pill` must replace an
// earlier `rounded-sm`, so the merger has to know them.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { rounded: [{ rounded: ['control', 'surface', 'pill'] }] } }
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
