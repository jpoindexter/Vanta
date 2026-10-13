import { atom } from 'nanostores'

const STORAGE_KEY = 'vanta.homeOpen'

function readInitial(): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

function remember(open: boolean): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, open ? '1' : '0')
  } catch {
    // Storage can be blocked; Home then simply reopens after a reload.
  }
}

/** Whether the root route shows the Home dashboard instead of an empty chat.
 *  The app opens on Home; New session (or sending from Home) switches to the
 *  chat, and the Home row brings the dashboard back. Kept for the window's
 *  lifetime so a reload lands where the person was. */
export const $homeOpen = atom(readInitial())

export function openHome(): void {
  $homeOpen.set(true)
  remember(true)
}

export function closeHome(): void {
  $homeOpen.set(false)
  remember(false)
}
