import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The radius roles and type steps (styles.css) are classes like any other: a later `rounded-pill` must replace an
// earlier `rounded-sm`, and `text-meta` is a font size, not a colour (unknown names merge as colours and would be
// dropped next to `text-muted-foreground`), so the merger has to know them.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['micro', 'meta', 'ui', 'label', 'body', 'lead', 'display'] }],
      rounded: [{ rounded: ['control', 'surface', 'pill'] }]
    }
  }
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
