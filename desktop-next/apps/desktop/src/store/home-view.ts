import { atom } from 'nanostores'

/** Whether the root route shows the Home dashboard instead of an empty chat.
 *  The app opens on Home; New session (or sending from Home) switches to the
 *  chat, and the Home row brings the dashboard back. Not persisted. */
export const $homeOpen = atom(true)

export function openHome(): void {
  $homeOpen.set(true)
}

export function closeHome(): void {
  $homeOpen.set(false)
}
