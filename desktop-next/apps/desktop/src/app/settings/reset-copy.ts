/** Plain-English copy for the Reset & data page. */
export const RESET_COPY = {
  appBody: 'Puts this window back to how it looked on first launch: theme, layout, shortcuts and cached data. Your sessions, memory, skills and saved approvals stay.',
  appButton: 'Reset app settings',
  appTitle: 'Reset app settings',
  cancel: 'Cancel',
  everythingBody:
    'Starts Vanta from nothing: sessions, memory, skills, saved approvals, connector settings and everything above are removed. Keys stored in the macOS Keychain are not touched.',
  everythingButton: 'Erase all Vanta data',
  everythingTitle: 'Erase all Vanta data',
  intro: 'Both options move folders to the Trash, so Finder can put them back. Vanta restarts when it is done.',
  nav: 'Reset & data',
  typeLabel: 'Type erase to confirm',
  unavailable: 'Reset is only available in the Vanta desktop app.'
} as const

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/** 1536 -> "1.5 KB". Whole numbers below 10 units keep one decimal; larger drop it. */
export function formatBytes(bytes: number): string {
  let value = bytes
  let unit = 0

  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${unit === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${UNITS[unit]}`
}
