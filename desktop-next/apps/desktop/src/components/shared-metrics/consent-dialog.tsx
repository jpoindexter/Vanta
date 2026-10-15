import type { SharedMetricsRequester } from '@/store/shared-metrics'

interface SharedMetricsConsentDialogProps {
  enabled: boolean
  profile: string
  requestGateway: SharedMetricsRequester
}

/** Vanta never asks to share usage metrics; this stays as an inert mount point. */
export function SharedMetricsConsentDialog(_props: SharedMetricsConsentDialogProps): null {
  return null
}
