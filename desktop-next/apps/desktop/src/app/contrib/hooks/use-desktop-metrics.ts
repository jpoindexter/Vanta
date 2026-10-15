/** Vanta does not collect usage metrics; the hook is kept so the imported wiring compiles. */
export function useDesktopMetrics(_options: {
  enabled: boolean
  gatewayOpen: boolean
  pathname: string
  profile: string
}): void {}
