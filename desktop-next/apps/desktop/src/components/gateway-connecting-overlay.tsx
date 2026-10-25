import type { ConnectionState } from '@vanta/shared'
import { useStore } from '@nanostores/react'
import { useRef } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { isOnboardingEnabled } from '@/lib/onboarding-enabled'
import { $desktopBoot, type DesktopBootState } from '@/store/boot'
import { $gatewaySwitching } from '@/store/gateway-switch'
import { $onboardingStateRead } from '@/store/onboarding-gate'
import { $introStartExit, $introView } from '@/store/onboarding-intro'
import { $gatewayState } from '@/store/session'
import { isMainWindow } from '@/store/windows'

function isInitialConnect(
  boot: DesktopBootState,
  gatewaySwitching: boolean,
  gatewayState: ConnectionState,
  coldBootDone: boolean
): boolean {
  const initialBootActive = boot.visible || boot.running || boot.progress < 100

  return !coldBootDone && !gatewaySwitching && gatewayState !== 'open' && !boot.error && initialBootActive
}

/** Compatibility name: ordinary connection progress no longer masks the chat.
 * The boot machine still owns timeout/failure; hard recovery and update holds
 * keep their separate surfaces. This status never takes focus or delays ready. */
export function GatewayConnectingOverlay() {
  const gatewayState = useStore($gatewayState)
  const boot = useStore($desktopBoot)
  const gatewaySwitching = useStore($gatewaySwitching)
  const onboardingStateRead = useStore($onboardingStateRead)
  const introView = useStore($introView)
  const introStartExit = useStore($introStartExit)
  const { t } = useI18n()
  const coldBootDoneRef = useRef(false)

  if (!boot.running && boot.progress >= 100 && !boot.error) {
    coldBootDoneRef.current = true
  }

  const connecting = isInitialConnect(boot, gatewaySwitching, gatewayState, coldBootDoneRef.current)
  const slowSetup =
    isMainWindow() && isOnboardingEnabled() && (!onboardingStateRead || introView === 'starting')
      ? introStartExit
      : null

  if (boot.error || boot.updateHold || (!connecting && !slowSetup)) {
    return null
  }

  const openLogs = () => void window.desktopBridge?.revealLogs().catch(() => undefined)

  return (
    <div className="pointer-events-none fixed end-3 top-[calc(var(--titlebar-height,34px)+0.5rem)] z-(--z-connecting) max-w-[calc(100vw-1.5rem)]">
      <div
        aria-atomic="true"
        aria-live="polite"
        className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg bg-(--ui-chat-bubble-background) px-3 py-2 text-xs text-muted-foreground shadow-sm"
        data-testid="gateway-connecting-status"
        role="status"
      >
        <span>{slowSetup ? t.onboarding.setupSlowTitle : t.shell.statusbar.gatewayConnecting}</span>
        <Button onClick={openLogs} size="sm" type="button" variant="ghost">
          {t.boot.failure.openLogs}
        </Button>
        {slowSetup ? (
          <Button onClick={slowSetup} size="sm" type="button" variant="secondary">
            {t.onboarding.continueWithoutSetup}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
