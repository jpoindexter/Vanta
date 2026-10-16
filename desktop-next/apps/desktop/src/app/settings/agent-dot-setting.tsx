import { type ReactElement, useEffect, useState } from 'react'

import { notifyError } from '@/store/notifications'

import { ToggleRow } from './primitives'

export const AGENT_DOT_COPY = {
  description: 'A small dot that stays above your other windows and shows whether Vanta is working, needs you, or has finished. Click it to open Vanta.',
  failed: 'Could not change the agent dot',
  label: 'Show the agent dot'
} as const

/** Turns the always-on-top agent dot on or off. Absent outside the Vanta shell. */
export function AgentDotSetting(): ReactElement | null {
  const bridge = window.desktopBridge?.agentDot
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    if (!bridge) return

    const off = bridge.onChanged(next => setEnabled(next.enabled))
    void bridge.get().then(next => setEnabled(next.enabled)).catch(error => notifyError(error, AGENT_DOT_COPY.failed))

    return off
  }, [bridge])

  if (!bridge) return null

  const change = (on: boolean): void => {
    const previous = enabled
    setEnabled(on)
    void bridge.set(on).then(next => setEnabled(next.enabled)).catch(error => {
      setEnabled(previous)
      notifyError(error, AGENT_DOT_COPY.failed)
    })
  }

  return <ToggleRow checked={enabled ?? false} description={AGENT_DOT_COPY.description} disabled={enabled === null} label={AGENT_DOT_COPY.label} onChange={change} />
}
