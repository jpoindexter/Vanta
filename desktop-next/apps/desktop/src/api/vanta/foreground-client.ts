/**
 * The chat whose event stream approval cards for non-chat actions (a profile import, a skill
 * install, a script schedule) travel on. It is the chat most recently created or resumed that is
 * still open. Module state on purpose: the REST shim runs outside the gateway and only needs the id.
 */
let foreground: null | string = null

export function noteForegroundClient(clientId: string): void {
  foreground = clientId
}

export function dropForegroundClient(clientId: string): void {
  if (foreground === clientId) {
    foreground = null
  }
}

export function foregroundClientId(): null | string {
  return foreground
}
