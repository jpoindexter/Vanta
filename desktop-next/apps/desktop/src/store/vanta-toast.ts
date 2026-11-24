import { atom } from 'nanostores'

/** How long a confirmation stays on screen. The wireframe clears it after 2.6s. */
export const VANTA_TOAST_MS = 2600

/** The one-line confirmation shown at the bottom of the chat ('' when none). */
export const $vantaToast = atom('')

let timer: ReturnType<typeof setTimeout> | undefined

export function showVantaToast(text: string, durationMs = VANTA_TOAST_MS): void {
  clearTimeout(timer)
  $vantaToast.set(text)
  timer = setTimeout(() => $vantaToast.set(''), durationMs)
}

export function clearVantaToast(): void {
  clearTimeout(timer)
  $vantaToast.set('')
}
