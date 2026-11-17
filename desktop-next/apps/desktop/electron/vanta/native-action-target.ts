/** Main-process-only custody of one native action; never accepted from a renderer payload. */
export interface NativeActionTarget {
  readonly clientId: string
  readonly connectionId: 'local'
  readonly profile: string
  readonly lease: number
  readonly generation: number
}
